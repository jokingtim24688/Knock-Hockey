/* ============================================================================
 * KNOCK HOCKEY — 2D physics prototype (Matter.js)
 *
 * Top-down, zero-gravity arena. The player flicks THE PUCK directly with a
 * drag-and-release slingshot; the puck ricochets off walls and bumpers and is
 * scored when it enters a goal.
 *
 * Two engine states, switched by the overlay Mode Toggle:
 *   - NORMAL   : human drag-and-release slingshot; optional AI Aim Assist.
 *   - TRAINING : human input disabled; the real engine's auto-runner is
 *                stopped and the world is advanced ONLY through
 *                GameEnv.step(action) — the bridge for an external RL agent.
 *
 * SLINGSHOT MATH (impulse model)
 *   Grab the puck, drag to a pointer P. Let A be the puck anchor (its frozen
 *   center). The "pull-back" vector is  pull = A - P.
 *     distance = |pull|                    (how far you dragged)
 *     angle    = atan2(pull.y, pull.x)     (launch heading = opposite the drag)
 *     speed    = clamp(distance * FLICK_GAIN, 0, FLICK_MAX_SPEED)
 *     velocity = normalize(pull) * speed
 *   The puck is frozen (v = 0) while aiming, so setVelocity(velocity) is a pure
 *   impulse J = m * velocity applied at release. Launch is exactly opposite the
 *   drag and its magnitude is proportional to the drag distance.
 * ==========================================================================*/

(function () {
  "use strict";

  const { Engine, Render, Runner, World, Bodies, Body, Composite, Events, Vector } = Matter;

  /* ----- Tunable physics constants --------------------------------------- */
  const CONFIG = {
    // Puck: bouncy + slippery, with a touch of air friction so it settles.
    PUCK_RESTITUTION: 0.9,     // aggressive ricochet off walls/bumpers
    PUCK_FRICTION_AIR: 0.012,  // long glide, but decays to a stop
    PUCK_FRICTION: 0.0,
    PUCK_FRICTION_STATIC: 0.0,
    PUCK_RADIUS: 16,
    PUCK_DENSITY: 0.004,

    WALL_RESTITUTION: 0.9,
    WALL_THICKNESS: 80,        // thick walls: with the speed cap below, the puck
                               // can never travel more than one wall-thickness
                               // per tick, so it cannot tunnel through.
    GOAL_WIDTH: 132,

    BUMPER_RESTITUTION: 1.0,

    // Slingshot tuning.
    FLICK_GAIN: 0.16,          // velocity per pixel of drag distance
    FLICK_MAX_SPEED: 30,       // hard cap (px/tick). < WALL_THICKNESS => no tunneling
    FLICK_DEADZONE: 4,         // ignore micro-drags (px)

    STOP_THRESHOLD: 0.09,      // below this speed the puck snaps to a full stop

    GHOST_TICKS: 170,          // aim-assist look-ahead
    GHOST_DT: 1000 / 60,
    TRAIN_DT: 1000 / 60,

    GRAB_SLOP: 16              // extra px around the puck that still starts a drag
  };

  const MODE = { NORMAL: "normal", TRAINING: "training" };

  /* ----- Runtime state --------------------------------------------------- */
  const state = {
    mode: MODE.NORMAL,
    aimAssist: false,
    score: { left: 0, right: 0 },
    dragging: false,
    dragAnchor: null,   // puck center captured at grab time (world coords)
    dragCurrent: null,  // live pointer position (world coords)
    assistPath: null
  };

  /* ----- DOM handles ----------------------------------------------------- */
  const arenaEl      = document.getElementById("arena");
  const canvasEl     = document.getElementById("game-canvas");
  const scoreLeftEl  = document.getElementById("score-left");
  const scoreRightEl = document.getElementById("score-right");
  const modeHintEl   = document.getElementById("mode-hint");

  /* ----- Engine / render / runner ---------------------------------------- */
  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;                 // top-down: NO gravity
  // More solver iterations => crisp, stable high-speed bounces.
  engine.positionIterations = 10;
  engine.velocityIterations = 10;
  engine.constraintIterations = 4;
  const world = engine.world;

  // World == arena box in CSS pixels, 1:1 (critical for drag-line alignment).
  const W = arenaEl.clientWidth;
  const H = arenaEl.clientHeight;

  const render = Render.create({
    canvas: canvasEl,
    engine: engine,
    options: {
      width: W,
      height: H,
      pixelRatio: window.devicePixelRatio || 1,
      background: "transparent",
      wireframes: false,
      hasBounds: false          // keep world<->screen mapping identity
    }
  });
  Render.run(render);

  const runner = Runner.create();

  /* ========================================================================
   * ARENA CONSTRUCTION
   * ======================================================================*/
  let puck, goalTop, goalBottom;
  const PUCK_START = { x: W / 2, y: H / 2 };

  const wallStyle   = { isStatic: true, restitution: CONFIG.WALL_RESTITUTION, label: "wall",
                        render: { fillStyle: "#1a1f2b", strokeStyle: "rgba(255,255,255,0.10)", lineWidth: 1 } };
  const bumperStyle = { isStatic: true, restitution: CONFIG.BUMPER_RESTITUTION, label: "bumper",
                        render: { fillStyle: "#161b26", strokeStyle: "rgba(255,255,255,0.22)", lineWidth: 1.5 } };

  function buildArena() {
    const t  = CONFIG.WALL_THICKNESS;
    const gw = CONFIG.GOAL_WIDTH;
    const sideLen = (W - gw) / 2;

    // Perimeter walls; top & bottom split to leave a centered goal gap.
    const walls = [
      Bodies.rectangle(sideLen / 2,       -t / 2 + 1, sideLen, t, { ...wallStyle }),
      Bodies.rectangle(W - sideLen / 2,   -t / 2 + 1, sideLen, t, { ...wallStyle }),
      Bodies.rectangle(sideLen / 2,      H + t / 2 - 1, sideLen, t, { ...wallStyle }),
      Bodies.rectangle(W - sideLen / 2,  H + t / 2 - 1, sideLen, t, { ...wallStyle }),
      Bodies.rectangle(-t / 2 + 1, H / 2, t, H + t * 2, { ...wallStyle }),
      Bodies.rectangle(W + t / 2 - 1, H / 2, t, H + t * 2, { ...wallStyle })
    ];

    // Bumpers placed off the center so the puck's start is clear.
    const bumpers = [
      Bodies.circle(W * 0.30, H * 0.36, 17, { ...bumperStyle }),
      Bodies.circle(W * 0.70, H * 0.64, 17, { ...bumperStyle }),
      Bodies.circle(W * 0.72, H * 0.30, 11, { ...bumperStyle }),
      Bodies.circle(W * 0.28, H * 0.70, 11, { ...bumperStyle })
    ];

    // Goal sensors (detection only, no physical response).
    goalTop = Bodies.rectangle(W / 2, 5, gw, 12, {
      isStatic: true, isSensor: true, label: "goal-top",
      render: { fillStyle: "rgba(255,159,10,0.16)", strokeStyle: "#ff9f0a", lineWidth: 1.5 }
    });
    goalBottom = Bodies.rectangle(W / 2, H - 5, gw, 12, {
      isStatic: true, isSensor: true, label: "goal-bottom",
      render: { fillStyle: "rgba(10,132,255,0.16)", strokeStyle: "#0a84ff", lineWidth: 1.5 }
    });

    // THE PUCK — the one dynamic body the player controls.
    puck = Bodies.circle(PUCK_START.x, PUCK_START.y, CONFIG.PUCK_RADIUS, {
      label: "puck",
      restitution: CONFIG.PUCK_RESTITUTION,
      frictionAir: CONFIG.PUCK_FRICTION_AIR,
      friction: CONFIG.PUCK_FRICTION,
      frictionStatic: CONFIG.PUCK_FRICTION_STATIC,
      density: CONFIG.PUCK_DENSITY,
      isBullet: true,           // intent flag (Matter 0.19 has no native CCD;
                                // real anti-tunneling comes from the speed cap)
      render: { fillStyle: "#f4f6fa", strokeStyle: "#ffffff", lineWidth: 2 }
    });

    World.add(world, [...walls, ...bumpers, goalTop, goalBottom, puck]);
  }

  /* ========================================================================
   * GOAL DETECTION + CLEAN-STOP
   * ======================================================================*/
  Events.on(engine, "collisionStart", function (evt) {
    for (const pair of evt.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (!labels.includes("puck")) continue;
      if (labels.includes("goal-top"))    { state.score.left  += 1; onGoalScored(); }
      else if (labels.includes("goal-bottom")) { state.score.right += 1; onGoalScored(); }
    }
  });

  // Snap the puck to a full, clean stop once it's crawling — no infinite drift.
  Events.on(engine, "afterUpdate", function () {
    if (state.dragging) return;
    const speed = Vector.magnitude(puck.velocity);
    if (speed > 0 && speed < CONFIG.STOP_THRESHOLD) {
      Body.setVelocity(puck, { x: 0, y: 0 });
      Body.setAngularVelocity(puck, 0);
    }
  });

  function onGoalScored() {
    updateScoreboard();
    recenterPuck();
  }
  function recenterPuck() {
    Body.setPosition(puck, { x: PUCK_START.x, y: PUCK_START.y });
    Body.setVelocity(puck, { x: 0, y: 0 });
    Body.setAngularVelocity(puck, 0);
  }
  function updateScoreboard() {
    scoreLeftEl.textContent = String(state.score.left);
    scoreRightEl.textContent = String(state.score.right);
  }

  /* ========================================================================
   * COORDINATE MAPPING
   * The canvas backing store is scaled by devicePixelRatio, but Matter's
   * render context maps world units to CSS pixels 1:1 (hasBounds:false, bounds
   * 0..W/0..H). So (clientX - arenaRect.left, clientY - arenaRect.top) is the
   * exact world coordinate — no offset, and it's recomputed per event so it
   * stays correct under scroll/resize.
   * ======================================================================*/
  function toWorld(evt) {
    const rect = arenaEl.getBoundingClientRect();
    const src = (evt.touches && evt.touches[0]) ? evt.touches[0] : evt;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  /* ========================================================================
   * SLINGSHOT MATH (pure functions — also exported for tests)
   * ======================================================================*/
  function computeFlickVelocity(anchor, pointer) {
    const pull = Vector.sub(anchor, pointer);          // launch = opposite of drag
    const distance = Vector.magnitude(pull);
    if (distance < CONFIG.FLICK_DEADZONE) return { x: 0, y: 0 };
    const speed = Math.min(distance * CONFIG.FLICK_GAIN, CONFIG.FLICK_MAX_SPEED);
    const dir = Vector.div(pull, distance);            // normalized (safe: distance>0)
    return { x: dir.x * speed, y: dir.y * speed };
  }

  /* ========================================================================
   * HUMAN SLINGSHOT (NORMAL MODE ONLY)
   * ======================================================================*/
  function pointerDown(evt) {
    if (state.mode !== MODE.NORMAL) return;
    const p = toWorld(evt);
    const d = Vector.magnitude(Vector.sub(p, puck.position));
    if (d > CONFIG.PUCK_RADIUS + CONFIG.GRAB_SLOP) return;   // must grab the puck

    state.dragging = true;
    state.dragAnchor = { x: puck.position.x, y: puck.position.y };  // freeze anchor
    state.dragCurrent = p;
    Body.setVelocity(puck, { x: 0, y: 0 });                 // hold still while aiming
    Body.setAngularVelocity(puck, 0);
    if (evt.cancelable) evt.preventDefault();
  }

  function pointerMove(evt) {
    if (!state.dragging) return;
    state.dragCurrent = toWorld(evt);
    // Keep the puck pinned to its anchor while aiming (no drift under pointer).
    Body.setPosition(puck, state.dragAnchor);
    Body.setVelocity(puck, { x: 0, y: 0 });
    if (evt.cancelable) evt.preventDefault();
  }

  function pointerUp(evt) {
    if (!state.dragging) return;
    state.dragging = false;
    const launch = computeFlickVelocity(state.dragAnchor, state.dragCurrent);
    Body.setPosition(puck, state.dragAnchor);
    Body.setVelocity(puck, launch);                         // impulse release
    state.dragAnchor = null;
    state.dragCurrent = null;
    if (evt && evt.cancelable) evt.preventDefault();
  }

  canvasEl.addEventListener("mousedown", pointerDown);
  window.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);
  canvasEl.addEventListener("touchstart", pointerDown, { passive: false });
  window.addEventListener("touchmove", pointerMove, { passive: false });
  window.addEventListener("touchend", pointerUp, { passive: false });

  /* ========================================================================
   * AIM ASSIST — GHOST ENGINE
   *
   * drawAimAssistTrajectory(suggestedVector)
   * ----------------------------------------
   * Ghost-engine preview. Recipe (implemented in condensed form below):
   *   (a) Instantiate a SECOND, INVISIBLE Matter.js engine — see
   *       ensureGhostEngine(). It has no Render, so it never paints; we only
   *       read out body coordinates from it.
   *   (b) Clone the arena state: copy the real static walls + bumpers into the
   *       ghost world so collisions match exactly. (Done once and cached.)
   *   (c) Place a ghost puck at the real puck's position and apply
   *       `suggestedVector` as its initial velocity.
   *   (d) Step the invisible engine forward INSTANTLY by CONFIG.GHOST_TICKS
   *       ticks, recording the ghost puck's position after each step.
   *   (e) Return the coordinate array; the renderer draws it with canvas
   *       moveTo/lineTo as a dotted line on the real screen (drawDottedPath()).
   * ======================================================================*/
  let ghostEngine = null;
  let ghostPuck = null;

  function ensureGhostEngine() {
    if (ghostEngine) return;

    ghostEngine = Engine.create();
    ghostEngine.gravity.x = 0;
    ghostEngine.gravity.y = 0;
    ghostEngine.positionIterations = 10;
    ghostEngine.velocityIterations = 10;

    // Clone every static, non-sensor body (walls + bumpers) into the ghost world.
    const clones = [];
    for (const body of Composite.allBodies(world)) {
      if (!body.isStatic || body.isSensor) continue;
      const verts = body.vertices.map(v => ({ x: v.x, y: v.y }));
      let clone = Bodies.fromVertices(body.position.x, body.position.y, [verts], { isStatic: true });
      if (!clone) {
        clone = Bodies.circle(body.position.x, body.position.y, body.circleRadius || 10, { isStatic: true });
      }
      clone.restitution = body.restitution;
      clones.push(clone);
    }
    World.add(ghostEngine.world, clones);

    ghostPuck = Bodies.circle(0, 0, CONFIG.PUCK_RADIUS, {
      restitution: CONFIG.PUCK_RESTITUTION,
      frictionAir: CONFIG.PUCK_FRICTION_AIR,
      friction: CONFIG.PUCK_FRICTION,
      frictionStatic: CONFIG.PUCK_FRICTION_STATIC,
      density: CONFIG.PUCK_DENSITY,
      isBullet: true
    });
    World.add(ghostEngine.world, ghostPuck);
  }

  function drawAimAssistTrajectory(suggestedVector) {
    ensureGhostEngine();
    // (c) Reset the ghost puck onto the real puck and inject the vector.
    Body.setPosition(ghostPuck, { x: puck.position.x, y: puck.position.y });
    Body.setAngularVelocity(ghostPuck, 0);
    Body.setVelocity(ghostPuck, { x: suggestedVector.x, y: suggestedVector.y });

    // (d) Fast-forward the invisible engine and sample the path.
    const path = [{ x: ghostPuck.position.x, y: ghostPuck.position.y }];
    for (let i = 0; i < CONFIG.GHOST_TICKS; i++) {
      Engine.update(ghostEngine, CONFIG.GHOST_DT);
      path.push({ x: ghostPuck.position.x, y: ghostPuck.position.y });
    }
    return path; // (e) drawn by the afterRender hook
  }

  // Dummy "optimal shot": aim the puck straight at the top goal center.
  // A real system would swap this for a solver or trained policy suggestion.
  function computeDummyOptimalVector() {
    const dir = Vector.normalise(Vector.sub({ x: W / 2, y: 0 }, puck.position));
    return Vector.mult(dir, CONFIG.FLICK_MAX_SPEED * 0.85);
  }

  /* ========================================================================
   * OVERLAY RENDERING (drag band + trajectory previews)
   * ======================================================================*/
  Events.on(render, "afterRender", function () {
    const ctx = render.context;

    if (state.dragging && state.dragAnchor && state.dragCurrent) {
      const launch = computeFlickVelocity(state.dragAnchor, state.dragCurrent);
      const powered = (launch.x !== 0 || launch.y !== 0);

      // Rubber band: pointer -> puck anchor (anchored EXACTLY at puck center).
      drawLine(ctx, state.dragCurrent, state.dragAnchor, "rgba(255,255,255,0.35)", 2, [6, 6]);
      drawRing(ctx, state.dragCurrent, 6, "rgba(255,255,255,0.5)");
      drawRing(ctx, state.dragAnchor, CONFIG.PUCK_RADIUS + 3, powered ? "#30d158" : "rgba(255,255,255,0.4)");

      // Predicted flight path from the puck for the player's own shot.
      if (powered) {
        const preview = drawAimAssistTrajectory(launch);
        drawDottedPath(ctx, preview, "rgba(48,209,88,0.9)", 1);
      }
    }

    // Standing AI Aim Assist preview (Normal mode, not dragging).
    if (state.mode === MODE.NORMAL && state.aimAssist && !state.dragging) {
      state.assistPath = drawAimAssistTrajectory(computeDummyOptimalVector());
      drawDottedPath(ctx, state.assistPath, "rgba(124,255,155,0.85)", 1);
    }
  });

  function drawDottedPath(ctx, points, color, alpha) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }
  function drawLine(ctx, a, b, color, w, dash) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round";
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  function drawRing(ctx, c, r, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /* ========================================================================
   * MODE MANAGEMENT
   * ======================================================================*/
  function setMode(mode) {
    state.mode = mode;
    const isNormal = mode === MODE.NORMAL;

    const seg = document.getElementById("mode-seg");
    seg.setAttribute("data-active", mode);
    document.getElementById("mode-normal").classList.toggle("active", isNormal);
    document.getElementById("mode-training").classList.toggle("active", !isNormal);
    document.getElementById("mode-normal").setAttribute("aria-selected", String(isNormal));
    document.getElementById("mode-training").setAttribute("aria-selected", String(!isNormal));

    const assistToggle = document.getElementById("assist-toggle");
    const assistRow = document.getElementById("assist-row");
    assistToggle.disabled = !isNormal;
    assistRow.classList.toggle("disabled", !isNormal);

    // Cancel any in-flight drag on mode switch.
    state.dragging = false;
    state.dragAnchor = null;
    state.dragCurrent = null;
    arenaEl.classList.toggle("input-disabled", !isNormal);

    if (isNormal) {
      Runner.run(runner, engine);          // physics free-runs
      modeHintEl.textContent = state.aimAssist
        ? "Aim assist on — the green line previews the suggested shot."
        : "Drag from the puck and release to flick it.";
    } else {
      Runner.stop(runner);                 // world advances only via GameEnv.step()
      modeHintEl.textContent = "Training mode — drive the puck via GameEnv.step(action).";
    }
  }

  /* ========================================================================
   * RESET
   * ======================================================================*/
  function resetGame(resetScore) {
    recenterPuck();
    if (resetScore) { state.score.left = 0; state.score.right = 0; updateScoreboard(); }
  }

  /* ========================================================================
   * HEADLESS API — GameEnv  (RL bridge; use in TRAINING mode)
   * World/canvas pixels; origin top-left, +x right, +y down.
   * ======================================================================*/
  const GameEnv = {
    spec() {
      return {
        width: W, height: H,
        actionSpace: { type: "box", shape: [2],
          low: [-CONFIG.FLICK_MAX_SPEED, -CONFIG.FLICK_MAX_SPEED],
          high: [CONFIG.FLICK_MAX_SPEED, CONFIG.FLICK_MAX_SPEED] },
        goals: { top: "left-scores", bottom: "right-scores" }
      };
    },
    getState() {
      const snap = (b) => ({ x: b.position.x, y: b.position.y, vx: b.velocity.x, vy: b.velocity.y, angle: b.angle });
      return { mode: state.mode, score: { ...state.score }, puck: snap(puck) };
    },
    /**
     * Apply an action (impulse velocity on the puck) and advance the sim.
     * @param {{vx:number,vy:number}|[number,number]} action
     * @param {{substeps?:number}} [opts]
     */
    step(action, opts) {
      const substeps = (opts && opts.substeps) || 1;
      const before = { l: state.score.left, r: state.score.right };
      if (action) {
        const vx = Array.isArray(action) ? action[0] : action.vx;
        const vy = Array.isArray(action) ? action[1] : action.vy;
        Body.setVelocity(puck, {
          x: clamp(vx || 0, -CONFIG.FLICK_MAX_SPEED, CONFIG.FLICK_MAX_SPEED),
          y: clamp(vy || 0, -CONFIG.FLICK_MAX_SPEED, CONFIG.FLICK_MAX_SPEED)
        });
      }
      for (let i = 0; i < substeps; i++) Engine.update(engine, CONFIG.TRAIN_DT);
      let reward = 0;
      if (state.score.left  > before.l) reward += 1;   // scored in target goal
      if (state.score.right > before.r) reward -= 1;   // own goal
      return { state: this.getState(), reward, done: false };
    },
    reset(opts) { resetGame(!(opts && opts.keepScore)); return this.getState(); },
    setMode(mode) { if (mode === MODE.NORMAL || mode === MODE.TRAINING) setMode(mode); return state.mode; }
  };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  window.GameEnv = GameEnv;

  // Internal hook for tests / external tooling (pure math + live refs).
  window.KnockHockey = {
    CONFIG,
    computeFlickVelocity,
    toWorld,
    getDrag: () => ({ dragging: state.dragging, anchor: state.dragAnchor, current: state.dragCurrent }),
    getPuck: () => ({ x: puck.position.x, y: puck.position.y, vx: puck.velocity.x, vy: puck.velocity.y }),
    bounds: { W, H }
  };

  /* ========================================================================
   * UI WIRING
   * ======================================================================*/
  function wireUI() {
    document.getElementById("mode-normal").addEventListener("click", () => setMode(MODE.NORMAL));
    document.getElementById("mode-training").addEventListener("click", () => setMode(MODE.TRAINING));

    document.getElementById("assist-toggle").addEventListener("change", (e) => {
      state.aimAssist = e.target.checked;
      state.assistPath = null;
      if (state.mode === MODE.NORMAL) {
        modeHintEl.textContent = state.aimAssist
          ? "Aim assist on — the green line previews the suggested shot."
          : "Drag from the puck and release to flick it.";
      }
    });

    document.getElementById("reset-btn").addEventListener("click", () => resetGame(false));

    const overlay = document.getElementById("overlay");
    document.getElementById("overlay-handle").addEventListener("click", (e) => {
      const collapsed = overlay.classList.toggle("collapsed");
      e.currentTarget.setAttribute("aria-expanded", String(!collapsed));
    });
  }

  /* ========================================================================
   * BOOT
   * ======================================================================*/
  buildArena();
  updateScoreboard();
  wireUI();
  setMode(MODE.NORMAL);
})();

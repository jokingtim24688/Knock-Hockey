/* ============================================================================
 * KNOCK HOCKEY — 2D physics prototype (Matter.js)
 *
 * Top-down, zero-gravity arena. Two strikers + one high-restitution puck.
 * Runs in a desktop browser but is structurally constrained to a 390x844
 * "phone" viewport (see index.html / styles.css).
 *
 * Two engine states, switched by the overlay Mode Toggle:
 *   - NORMAL   : human drag-and-release slingshot; optional AI Aim Assist.
 *   - TRAINING : human input disabled; the real engine's auto-runner is
 *                stopped and the world is advanced ONLY through
 *                GameEnv.step(action) — the bridge for an external RL agent.
 * ==========================================================================*/

(function () {
  "use strict";

  /* ----- Matter.js module aliases ---------------------------------------- */
  const {
    Engine, Render, Runner, World, Bodies, Body, Composite,
    Events, Vector, Query
  } = Matter;

  /* ----- Tunable physics constants --------------------------------------- */
  const CONFIG = {
    // Puck: bouncy and slippery, with just enough air friction to settle.
    PUCK_RESTITUTION: 0.92,
    PUCK_FRICTION_AIR: 0.018,   // carefully tuned: high enough to stop drifting forever
    PUCK_FRICTION: 0.0,
    PUCK_RADIUS: 14,
    PUCK_DENSITY: 0.002,

    // Strikers: heavier, still bouncy, slightly draggier so flicks decay.
    STRIKER_RESTITUTION: 0.6,
    STRIKER_FRICTION_AIR: 0.06,
    STRIKER_RADIUS: 20,
    STRIKER_DENSITY: 0.006,

    WALL_THICKNESS: 60,         // thick + partly offscreen to prevent tunneling
    GOAL_WIDTH: 120,            // width of the goal opening (top & bottom)

    // Slingshot: release velocity = pullback vector * this gain.
    FLICK_GAIN: 0.16,
    FLICK_MAX_SPEED: 26,        // clamp so a huge drag can't launch absurdly fast

    GHOST_TICKS: 150,           // how far forward the aim-assist ghost simulates
    GHOST_DT: 1000 / 60,        // ms per ghost tick (matches 60fps)
    TRAIN_DT: 1000 / 60         // ms advanced per GameEnv.step()
  };

  const MODE = { NORMAL: "normal", TRAINING: "training" };

  /* ----- Runtime state --------------------------------------------------- */
  const state = {
    mode: MODE.NORMAL,
    aimAssist: false,
    score: { left: 0, right: 0 },

    // Live drag (slingshot) state
    dragging: false,
    dragStart: null,   // striker anchor (world coords)
    dragCurrent: null, // pointer position (world coords)

    // Cached ghost-trajectory point array for rendering
    assistPath: null
  };

  /* ----- DOM handles ----------------------------------------------------- */
  const arenaEl   = document.getElementById("arena");
  const canvasEl  = document.getElementById("game-canvas");
  const scoreLeftEl  = document.getElementById("score-left");
  const scoreRightEl = document.getElementById("score-right");
  const modeHintEl   = document.getElementById("mode-hint");

  /* ----- Engine / render / runner ---------------------------------------- */
  const engine = Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;              // top-down: NO gravity
  const world = engine.world;

  // Size the world to the arena box (CSS pixels == world pixels, 1:1).
  const W = arenaEl.clientWidth;
  const H = arenaEl.clientHeight;

  const render = Render.create({
    canvas: canvasEl,
    engine: engine,
    options: {
      width: W,
      height: H,
      pixelRatio: "auto",
      background: "transparent",
      wireframes: false,          // we hand-pick flat colors for the sketch look
      showVelocity: false
    }
  });
  Render.run(render);

  const runner = Runner.create();

  /* ========================================================================
   * ARENA CONSTRUCTION
   * ======================================================================*/

  // Body references we need to reach later.
  let puck, playerStriker, aiStriker;
  let goalTop, goalBottom;

  const STATIC_STYLE  = { isStatic: true, render: { fillStyle: "#2a2e3a", strokeStyle: "#6f7480", lineWidth: 1 } };
  const BUMPER_STYLE  = { isStatic: true, restitution: 1.0, render: { fillStyle: "#1c1f29", strokeStyle: "#8a90a0", lineWidth: 1 } };

  function buildArena() {
    const t  = CONFIG.WALL_THICKNESS;
    const gw = CONFIG.GOAL_WIDTH;
    const midX = W / 2;
    const sideLen = (W - gw) / 2;

    // --- Perimeter walls. Top and bottom are split to leave a goal gap. ---
    const topLeft  = Bodies.rectangle(sideLen / 2,        -t / 2 + 1, sideLen, t, { ...STATIC_STYLE, label: "wall" });
    const topRight = Bodies.rectangle(W - sideLen / 2,    -t / 2 + 1, sideLen, t, { ...STATIC_STYLE, label: "wall" });
    const botLeft  = Bodies.rectangle(sideLen / 2,      H + t / 2 - 1, sideLen, t, { ...STATIC_STYLE, label: "wall" });
    const botRight = Bodies.rectangle(W - sideLen / 2,  H + t / 2 - 1, sideLen, t, { ...STATIC_STYLE, label: "wall" });
    const leftWall  = Bodies.rectangle(-t / 2 + 1, H / 2, t, H + t * 2, { ...STATIC_STYLE, label: "wall" });
    const rightWall = Bodies.rectangle(W + t / 2 - 1, H / 2, t, H + t * 2, { ...STATIC_STYLE, label: "wall" });

    // --- Central bumpers (static obstacles) ---
    const bumperA = Bodies.circle(midX, H / 2, 22, { ...BUMPER_STYLE, label: "bumper" });
    const bumperB = Bodies.circle(midX - 90, H / 2, 12, { ...BUMPER_STYLE, label: "bumper" });
    const bumperC = Bodies.circle(midX + 90, H / 2, 12, { ...BUMPER_STYLE, label: "bumper" });

    // --- Goal sensors (no physical response, just detection zones) ---
    goalTop = Bodies.rectangle(midX, 6, gw, 12, {
      isStatic: true, isSensor: true, label: "goal-top",
      render: { fillStyle: "rgba(255,122,89,0.18)", strokeStyle: "#ff7a59", lineWidth: 1 }
    });
    goalBottom = Bodies.rectangle(midX, H - 6, gw, 12, {
      isStatic: true, isSensor: true, label: "goal-bottom",
      render: { fillStyle: "rgba(78,161,255,0.18)", strokeStyle: "#4ea1ff", lineWidth: 1 }
    });

    // --- Dynamic bodies ---
    puck = Bodies.circle(midX, H / 2 - 60, CONFIG.PUCK_RADIUS, {
      label: "puck",
      restitution: CONFIG.PUCK_RESTITUTION,
      frictionAir: CONFIG.PUCK_FRICTION_AIR,
      friction: CONFIG.PUCK_FRICTION,
      density: CONFIG.PUCK_DENSITY,
      render: { fillStyle: "#e8e8e8", strokeStyle: "#ffffff", lineWidth: 1 }
    });

    playerStriker = Bodies.circle(midX, H * 0.82, CONFIG.STRIKER_RADIUS, {
      label: "player",
      restitution: CONFIG.STRIKER_RESTITUTION,
      frictionAir: CONFIG.STRIKER_FRICTION_AIR,
      density: CONFIG.STRIKER_DENSITY,
      render: { fillStyle: "#12324f", strokeStyle: "#4ea1ff", lineWidth: 2 }
    });

    aiStriker = Bodies.circle(midX, H * 0.18, CONFIG.STRIKER_RADIUS, {
      label: "ai",
      restitution: CONFIG.STRIKER_RESTITUTION,
      frictionAir: CONFIG.STRIKER_FRICTION_AIR,
      density: CONFIG.STRIKER_DENSITY,
      render: { fillStyle: "#4f231a", strokeStyle: "#ff7a59", lineWidth: 2 }
    });

    World.add(world, [
      topLeft, topRight, botLeft, botRight, leftWall, rightWall,
      bumperA, bumperB, bumperC,
      goalTop, goalBottom,
      puck, playerStriker, aiStriker
    ]);
  }

  /* ========================================================================
   * GOAL DETECTION
   * ======================================================================*/
  Events.on(engine, "collisionStart", function (evt) {
    for (const pair of evt.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (!labels.includes("puck")) continue;

      // Puck into the TOP goal => the bottom (player / left-score) player scored.
      if (labels.includes("goal-top")) {
        state.score.left += 1;
        onGoalScored();
      } else if (labels.includes("goal-bottom")) {
        state.score.right += 1;
        onGoalScored();
      }
    }
  });

  function onGoalScored() {
    updateScoreboard();
    // Re-center the puck; leave strikers where they are.
    Body.setPosition(puck, { x: W / 2, y: H / 2 - 60 });
    Body.setVelocity(puck, { x: 0, y: 0 });
    Body.setAngularVelocity(puck, 0);
  }

  function updateScoreboard() {
    scoreLeftEl.textContent = String(state.score.left);
    scoreRightEl.textContent = String(state.score.right);
  }

  /* ========================================================================
   * HUMAN SLINGSHOT (NORMAL MODE ONLY)
   *
   * Drag-and-release: press on your striker, pull back, release to flick.
   * Release velocity points from the pointer back toward the striker
   * (classic slingshot), scaled by FLICK_GAIN and clamped to FLICK_MAX_SPEED.
   * ======================================================================*/

  function toWorld(evt) {
    const rect = arenaEl.getBoundingClientRect();
    const src = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function pointerDown(evt) {
    if (state.mode !== MODE.NORMAL) return;            // input disabled in Training
    const p = toWorld(evt);
    // Only start a drag if the press lands on (or very near) the player striker.
    const d = Vector.magnitude(Vector.sub(p, playerStriker.position));
    if (d > CONFIG.STRIKER_RADIUS + 12) return;

    state.dragging = true;
    state.dragStart = { x: playerStriker.position.x, y: playerStriker.position.y };
    state.dragCurrent = p;
    // Freeze the striker while aiming so it doesn't drift under the pointer.
    Body.setVelocity(playerStriker, { x: 0, y: 0 });
    evt.preventDefault();
  }

  function pointerMove(evt) {
    if (!state.dragging) return;
    state.dragCurrent = toWorld(evt);
    evt.preventDefault();
  }

  function pointerUp(evt) {
    if (!state.dragging) return;
    state.dragging = false;

    const launch = computeFlickVelocity(state.dragStart, state.dragCurrent);
    Body.setVelocity(playerStriker, launch);

    state.dragStart = null;
    state.dragCurrent = null;
    evt.preventDefault();
  }

  // Pullback vector (striker - pointer) => launch direction, scaled & clamped.
  function computeFlickVelocity(anchor, pointer) {
    const pull = Vector.sub(anchor, pointer);          // points "forward"
    let v = Vector.mult(pull, CONFIG.FLICK_GAIN);
    const speed = Vector.magnitude(v);
    if (speed > CONFIG.FLICK_MAX_SPEED) {
      v = Vector.mult(Vector.normalise(v), CONFIG.FLICK_MAX_SPEED);
    }
    return v;
  }

  // Bind pointer + touch events.
  canvasEl.addEventListener("mousedown", pointerDown);
  window.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);
  canvasEl.addEventListener("touchstart", pointerDown, { passive: false });
  window.addEventListener("touchmove", pointerMove, { passive: false });
  window.addEventListener("touchend", pointerUp, { passive: false });

  /* ========================================================================
   * AIM ASSIST — GHOST ENGINE
   *
   * When AI Aim Assist is on, the game intercepts a "dummy optimal vector"
   * (a stand-in for what a real solver/agent would recommend) and runs a
   * throwaway ghost simulation to preview where that shot would send the
   * striker/puck. The predicted path is drawn as a dotted line on the real
   * canvas.
   * ======================================================================*/

  // A persistent secondary engine reused across frames (rebuilding the static
  // geometry every frame would be wasteful). Only the ghost striker moves.
  let ghostEngine = null;
  let ghostStriker = null;

  function ensureGhostEngine() {
    if (ghostEngine) return;

    // --- HOW THE GHOST ENGINE MIRRORS THE ARENA -------------------------
    // 1. Instantiate a second, INVISIBLE Matter.js engine (no Render attached
    //    to it — it never draws itself; we only read out body positions).
    ghostEngine = Engine.create();
    ghostEngine.gravity.x = 0;
    ghostEngine.gravity.y = 0;

    // 2. Clone the arena's *static* collision geometry (walls + bumpers) so
    //    the ghost puck bounces exactly like the real one would. We copy the
    //    real bodies' vertices/positions rather than re-deriving them, keeping
    //    the two worlds in lock-step even if the layout changes.
    const clones = [];
    for (const body of Composite.allBodies(world)) {
      if (!body.isStatic || body.isSensor) continue;    // skip goals/sensors
      const clone = Bodies.fromVertices(
        body.position.x, body.position.y,
        body.vertices.map(v => ({ x: v.x, y: v.y })),
        { isStatic: true }
      ) || Bodies.circle(body.position.x, body.position.y, body.circleRadius || 10, { isStatic: true });
      clone.restitution = body.restitution;
      clones.push(clone);
    }
    World.add(ghostEngine.world, clones);

    // 3. Add a ghost striker with the SAME physical params as the real one.
    ghostStriker = Bodies.circle(0, 0, CONFIG.STRIKER_RADIUS, {
      restitution: CONFIG.STRIKER_RESTITUTION,
      frictionAir: CONFIG.STRIKER_FRICTION_AIR,
      density: CONFIG.STRIKER_DENSITY
    });
    World.add(ghostEngine.world, ghostStriker);
  }

  /**
   * drawAimAssistTrajectory(suggestedVector)
   * ----------------------------------------
   * Placeholder / reference implementation of the "ghost engine" preview.
   *
   * Full recipe (implemented below in condensed form):
   *   (a) Instantiate a second, invisible Matter.js engine — see
   *       ensureGhostEngine(). It has no Render, so it never paints; we only
   *       sample body coordinates from it.
   *   (b) Clone the arena state: copy the real static walls + bumpers into the
   *       ghost world so collisions match. (Done once and cached.)
   *   (c) Place a ghost puck/striker at the real striker's position and apply
   *       `suggestedVector` as its initial velocity.
   *   (d) Step the invisible engine forward INSTANTLY by CONFIG.GHOST_TICKS
   *       (150) ticks, recording the ghost body position after each step.
   *   (e) Return the coordinate array. The renderer then uses canvas
   *       `moveTo` / `lineTo` with a dashed stroke to draw it on the real
   *       screen (see drawDottedPath()).
   *
   * @param {{x:number, y:number}} suggestedVector - launch velocity to preview.
   * @returns {Array<{x:number, y:number}>} predicted path points.
   */
  function drawAimAssistTrajectory(suggestedVector) {
    ensureGhostEngine();

    // (c) Reset the ghost striker onto the real striker and inject the vector.
    Body.setPosition(ghostStriker, {
      x: playerStriker.position.x,
      y: playerStriker.position.y
    });
    Body.setAngularVelocity(ghostStriker, 0);
    Body.setVelocity(ghostStriker, { x: suggestedVector.x, y: suggestedVector.y });

    // (d) Fast-forward the invisible engine and sample the path.
    const path = [{ x: ghostStriker.position.x, y: ghostStriker.position.y }];
    for (let i = 0; i < CONFIG.GHOST_TICKS; i++) {
      Engine.update(ghostEngine, CONFIG.GHOST_DT);
      path.push({ x: ghostStriker.position.x, y: ghostStriker.position.y });
    }

    // (e) Hand the sampled array back; actual drawing happens in afterRender.
    return path;
  }

  // A dummy stand-in for a "perfect shot" recommendation: aim the striker
  // straight through the puck toward the opponent's (top) goal. A real system
  // would replace this with a solver or a trained policy's suggested action.
  function computeDummyOptimalVector() {
    const toPuck = Vector.sub(puck.position, playerStriker.position);
    const dir = Vector.normalise(toPuck);
    // Nudge the aim toward the top goal center for a more "shot-like" preview.
    const toGoal = Vector.normalise(Vector.sub({ x: W / 2, y: 0 }, puck.position));
    const blended = Vector.normalise(Vector.add(dir, Vector.mult(toGoal, 0.5)));
    return Vector.mult(blended, CONFIG.FLICK_MAX_SPEED * 0.8);
  }

  /* ========================================================================
   * OVERLAY RENDERING (drag line + assist trajectory)
   * ======================================================================*/
  Events.on(render, "afterRender", function () {
    const ctx = render.context;

    // 1. Live slingshot aim guide while dragging.
    if (state.dragging && state.dragStart && state.dragCurrent) {
      const launch = computeFlickVelocity(state.dragStart, state.dragCurrent);
      // Pullback line (pointer -> striker)
      drawDottedPath(ctx, [state.dragCurrent, state.dragStart], "#ffffff", 0.5);
      // Launch direction preview (striker -> forward)
      const tip = Vector.add(state.dragStart, Vector.mult(launch, 6));
      drawArrow(ctx, state.dragStart, tip, "#4ea1ff");
    }

    // 2. AI Aim Assist ghost trajectory (Normal mode only).
    if (state.mode === MODE.NORMAL && state.aimAssist) {
      const suggested = computeDummyOptimalVector();
      state.assistPath = drawAimAssistTrajectory(suggested);
      drawDottedPath(ctx, state.assistPath, "#7CFF9B", 1);
    }
  });

  function drawDottedPath(ctx, points, color, alpha) {
    if (!points || points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawArrow(ctx, from, to, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const head = 8;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(ang - 0.4), to.y - head * Math.sin(ang - 0.4));
    ctx.lineTo(to.x - head * Math.cos(ang + 0.4), to.y - head * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ========================================================================
   * MODE MANAGEMENT
   * ======================================================================*/
  function setMode(mode) {
    state.mode = mode;

    const normalBtn = document.getElementById("mode-normal");
    const trainBtn  = document.getElementById("mode-training");
    const assistToggle = document.getElementById("assist-toggle");
    const assistRow = document.getElementById("assist-row");

    const isNormal = mode === MODE.NORMAL;

    normalBtn.classList.toggle("active", isNormal);
    trainBtn.classList.toggle("active", !isNormal);
    normalBtn.setAttribute("aria-selected", String(isNormal));
    trainBtn.setAttribute("aria-selected", String(!isNormal));

    // Aim assist only applies to human play.
    assistToggle.disabled = !isNormal;
    assistRow.style.opacity = isNormal ? "1" : "0.4";

    // Cancel any in-flight drag when switching modes.
    state.dragging = false;
    state.dragStart = null;
    state.dragCurrent = null;

    arenaEl.classList.toggle("input-disabled", !isNormal);

    if (isNormal) {
      // Resume the auto-runner: physics advances on its own each frame.
      Runner.run(runner, engine);
      modeHintEl.textContent = state.aimAssist
        ? "Aim assist on: green line previews the suggested shot."
        : "Drag from your striker and release to flick.";
    } else {
      // TRAINING: stop the auto-runner. The world now advances ONLY via
      // GameEnv.step(action). Render keeps painting the frozen/last state.
      Runner.stop(runner);
      modeHintEl.textContent = "Training mode: control the game via GameEnv.step(action).";
    }
  }

  /* ========================================================================
   * RESET
   * ======================================================================*/
  function resetGame(resetScore) {
    Body.setPosition(puck, { x: W / 2, y: H / 2 - 60 });
    Body.setVelocity(puck, { x: 0, y: 0 });
    Body.setAngularVelocity(puck, 0);

    Body.setPosition(playerStriker, { x: W / 2, y: H * 0.82 });
    Body.setVelocity(playerStriker, { x: 0, y: 0 });
    Body.setAngularVelocity(playerStriker, 0);

    Body.setPosition(aiStriker, { x: W / 2, y: H * 0.18 });
    Body.setVelocity(aiStriker, { x: 0, y: 0 });
    Body.setAngularVelocity(aiStriker, 0);

    if (resetScore) {
      state.score.left = 0;
      state.score.right = 0;
      updateScoreboard();
    }
  }

  /* ========================================================================
   * HEADLESS API — GameEnv
   *
   * The bridge for an external reinforcement-learning script (e.g. Python via
   * a browser automation / websocket layer). Designed to be used in TRAINING
   * mode, where the auto-runner is stopped and the agent drives stepping.
   *
   * Coordinates are in world/canvas pixels. Origin (0,0) is the top-left of
   * the playfield; +x is right, +y is down.
   * ======================================================================*/
  const GameEnv = {
    /** Static description of the environment (bounds, action shape, etc.). */
    spec() {
      return {
        width: W,
        height: H,
        actionSpace: {
          // action = { vx, vy }: velocity applied to the player striker.
          type: "box",
          shape: [2],
          low: [-CONFIG.FLICK_MAX_SPEED, -CONFIG.FLICK_MAX_SPEED],
          high: [CONFIG.FLICK_MAX_SPEED, CONFIG.FLICK_MAX_SPEED]
        },
        goals: { top: "left-scores", bottom: "right-scores" }
      };
    },

    /** Snapshot of the full observable state. */
    getState() {
      const snap = (b) => ({
        x: b.position.x, y: b.position.y,
        vx: b.velocity.x, vy: b.velocity.y,
        angle: b.angle
      });
      return {
        mode: state.mode,
        score: { left: state.score.left, right: state.score.right },
        puck: snap(puck),
        player: snap(playerStriker),
        ai: snap(aiStriker)
      };
    },

    /**
     * Apply an action and advance the simulation by one tick.
     * @param {{vx:number, vy:number}|[number,number]} action
     * @param {object} [opts]
     * @param {number} [opts.substeps=1] number of engine ticks to advance.
     * @returns {{state:object, reward:number, done:boolean}}
     */
    step(action, opts) {
      const substeps = (opts && opts.substeps) || 1;
      const before = { l: state.score.left, r: state.score.right };

      if (action) {
        const vx = Array.isArray(action) ? action[0] : action.vx;
        const vy = Array.isArray(action) ? action[1] : action.vy;
        // Clamp to the action space.
        const cx = clamp(vx || 0, -CONFIG.FLICK_MAX_SPEED, CONFIG.FLICK_MAX_SPEED);
        const cy = clamp(vy || 0, -CONFIG.FLICK_MAX_SPEED, CONFIG.FLICK_MAX_SPEED);
        Body.setVelocity(playerStriker, { x: cx, y: cy });
      }

      // Manually advance the (auto-runner-stopped) engine.
      for (let i = 0; i < substeps; i++) {
        Engine.update(engine, CONFIG.TRAIN_DT);
      }

      // Reward: +1 for scoring in the top goal (agent's target), -1 if scored on.
      let reward = 0;
      if (state.score.left > before.l) reward += 1;
      if (state.score.right > before.r) reward -= 1;

      return { state: this.getState(), reward, done: false };
    },

    /** Reset positions (and optionally the score) to the start configuration. */
    reset(opts) {
      const keepScore = opts && opts.keepScore;
      resetGame(!keepScore);
      return this.getState();
    },

    /** Programmatic mode switch (mirrors the overlay toggle). */
    setMode(mode) {
      if (mode === MODE.NORMAL || mode === MODE.TRAINING) setMode(mode);
      return state.mode;
    }
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Expose globally so an external script can reach the bridge.
  window.GameEnv = GameEnv;

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
          ? "Aim assist on: green line previews the suggested shot."
          : "Drag from your striker and release to flick.";
      }
    });

    document.getElementById("reset-btn").addEventListener("click", () => resetGame(true));

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
  setMode(MODE.NORMAL);   // starts the runner
})();

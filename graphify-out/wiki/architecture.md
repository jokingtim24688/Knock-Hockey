# Architecture & Relationships

[← index](./index.md)

## Load graph

```
index.html
 ├─ <link> styles.css
 ├─ <script> matter.min.js        (defines global `Matter`)
 └─ <script> game.js              (IIFE; reads DOM, uses `Matter`,
                                    exposes `window.GameEnv`, `window.KnockHockey`)
```

`game.js` is a single IIFE (`(function(){ ... })()`). It runs at load, reads the
DOM elements defined in `index.html`, builds the Matter world, wires the UI, and
boots in Normal mode.

## Runtime component graph

```
                        ┌──────────────────────────┐
   user pointer  ──────▶│ pointerDown/Move/Up       │
   (Normal mode)        │  (slingshot capture)      │
                        └─────────────┬─────────────┘
                                      │ computeFlickVelocity(anchor,pointer)
                                      ▼
   GameEnv.step(action) ─────▶  Body.setVelocity(puck, v)   ◀── impulse
   (Training mode)                    │
                                      ▼
                        ┌──────────────────────────┐
                        │ Matter Engine (world)     │  gravity = 0
                        │  puck (dynamic, isBullet) │  10 pos/vel iterations
                        │  walls, bumpers (static)  │
                        │  goalTop/goalBottom (sensor)
                        └───────┬───────────┬───────┘
             collisionStart     │           │  afterUpdate
             (goal → score,     │           │  (speed<STOP_THRESHOLD → v=0)
              recenter puck)    │           │
                                ▼           ▼
                        updateScoreboard   clean stop
                                │
                                ▼  Render (RAF) + afterRender overlay
                        ┌──────────────────────────┐
                        │ canvas draw               │
                        │  drag band, powered ring, │
                        │  drawDottedPath(...)       │
                        └──────────────────────────┘
                                      ▲
                        drawAimAssistTrajectory(vec)
                                      │
                        ┌──────────────────────────┐
                        │ Ghost Engine (invisible)  │  clones static geometry
                        │  ghostPuck, 170-tick sim  │  → predicted path points
                        └──────────────────────────┘
```

## Two engines

1. **Real engine** (`engine`/`world`): the visible game. Driven by `Runner` in
   Normal mode; by manual `Engine.update` in Training mode (via `GameEnv.step`).
2. **Ghost engine** (`ghostEngine`): a second, **invisible** Matter engine built
   once by `ensureGhostEngine()`. It clones the static walls + bumpers and holds
   one `ghostPuck`. `drawAimAssistTrajectory()` places the ghost puck on the real
   puck, injects a velocity, fast-forwards 170 ticks, and returns the sampled
   path for the renderer to draw as a dotted line. See
   [concepts/modes.md](./concepts/modes.md#ai-aim-assist--ghost-engine).

## Control flow by mode

| | Normal | Training |
|---|---|---|
| Human pointer input | enabled (`pointerDown` guards on mode) | disabled |
| Physics stepping | `Runner.run(runner, engine)` (auto) | `Runner.stop`; only `GameEnv.step` advances |
| Aim assist | available (sub-toggle) | disabled/greyed |
| Rendering | always on (`Render.run`, independent RAF) | always on |

## Edge legend (see graph.json)

- `loads` — HTML includes a script/stylesheet.
- `calls` — function invokes another.
- `reads_dom` — function/IIFE reads a DOM node by id/class.
- `mutates` — function changes a Matter body or game state.
- `exposes` — IIFE attaches a global.
- `previews` — aim-assist path derived from the ghost engine.

# File: `game.js`

[← index](../index.md) · [architecture](../architecture.md)

Single IIFE. Sets up Matter.js, the slingshot, aim assist, goal scoring, the
overlay UI wiring, and the two global bridges. Zero gravity, top-down.

## Constants — `CONFIG`

| Key | Value | Purpose |
|-----|-------|---------|
| `PUCK_RESTITUTION` | 0.9 | aggressive wall/bumper ricochet |
| `PUCK_FRICTION_AIR` | 0.012 | long glide, decays to stop |
| `PUCK_RADIUS` | 16 | puck size |
| `PUCK_DENSITY` | 0.004 | puck mass basis |
| `WALL_RESTITUTION` | 0.9 | bouncy walls |
| `WALL_THICKNESS` | 80 | thick walls; > max speed ⇒ no tunneling |
| `GOAL_WIDTH` | 132 | goal gap width (top & bottom) |
| `BUMPER_RESTITUTION` | 1.0 | fully elastic bumpers |
| `FLICK_GAIN` | 0.16 | velocity per pixel of drag distance |
| `FLICK_MAX_SPEED` | 30 | speed cap (px/tick); < wall thickness |
| `FLICK_DEADZONE` | 4 | ignore micro-drags (px) |
| `STOP_THRESHOLD` | 0.09 | snap puck to full stop below this speed |
| `GHOST_TICKS` | 170 | aim-assist look-ahead ticks |
| `GRAB_SLOP` | 16 | extra px around puck that still starts a drag |

## State — `state`

`{ mode, aimAssist, score:{left,right}, dragging, dragAnchor, dragCurrent, assistPath }`.
`dragAnchor` is the puck center captured at grab time (frozen while aiming);
`dragCurrent` is the live pointer in world coords.

## Bodies

- `puck` — the only dynamic body. `isBullet:true` (intent flag; Matter 0.19 has
  no native CCD), tuned restitution/frictionAir. Label `"puck"`.
- Walls — 6 static rectangles; top & bottom split around a centered goal gap. Label `"wall"`.
- Bumpers — 4 static circles placed off-center so the puck start is clear. Label `"bumper"`.
- `goalTop` / `goalBottom` — static **sensors** (no physical response). Labels `"goal-top"`, `"goal-bottom"`.
- `PUCK_START` = `{ x: W/2, y: H/2 }`.

## Functions

| Function | Summary | Calls / mutates |
|----------|---------|-----------------|
| `buildArena()` | creates walls, bumpers, goals, puck; adds to world | `Bodies.*`, `World.add` |
| `computeFlickVelocity(anchor, pointer)` | **pure** slingshot math → impulse velocity | `Vector.*` |
| `toWorld(evt)` | client coords → world coords via arena rect (no offset) | — |
| `pointerDown/Move/Up(evt)` | slingshot capture/aim/release (Normal only) | `computeFlickVelocity`, `Body.setVelocity/Position` |
| `ensureGhostEngine()` | build invisible engine + clone static geometry (once) | `Engine.create`, `Bodies.fromVertices/circle` |
| `drawAimAssistTrajectory(vec)` | place ghost puck, inject vec, step `GHOST_TICKS`, return path | `Engine.update`, `Body.*` |
| `computeDummyOptimalVector()` | stand-in "optimal" shot toward top goal | `Vector.*` |
| `onGoalScored()` / `recenterPuck()` | bump score, reset puck to center | `Body.setPosition/Velocity` |
| `updateScoreboard()` | write score DOM | reads `#score-left/right` |
| `setMode(mode)` | switch Normal/Training; start/stop runner; update UI | `Runner.run/stop` |
| `resetGame(resetScore)` | recenter puck, optionally zero score | `recenterPuck` |
| `wireUI()` | bind buttons/toggle/handle listeners | DOM events |
| `clamp(v,lo,hi)` | numeric clamp | — |

## Events

- `Events.on(engine, "collisionStart")` — puck vs `goal-top`/`goal-bottom` → score + recenter.
- `Events.on(engine, "afterUpdate")` — clean-stop snap when not dragging.
- `Events.on(render, "afterRender")` — draws drag band, powered ring, and dotted trajectory previews.

## Globals exposed

- `window.GameEnv` — RL bridge. See [api/GameEnv](../api/GameEnv.md).
- `window.KnockHockey` — test/tooling hook. See [api/KnockHockey](../api/KnockHockey.md).

## Boot sequence (bottom of file)

`buildArena()` → `updateScoreboard()` → `wireUI()` → `setMode("normal")` (starts the runner).

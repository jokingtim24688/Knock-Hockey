# Concept: Modes & AI Aim Assist

[← index](../index.md) · [game.js](../files/game-js.md)

## Mode toggle (`setMode`)

Segmented control (`#mode-seg`, `data-active`) switches two engine states:

### Normal mode (`"normal"`)
- Human pointer input **enabled** (`pointerDown/Move/Up`, gated on mode).
- Physics free-runs: `Runner.run(runner, engine)`.
- AI Aim Assist sub-toggle available.
- Hint: "Drag from the puck and release to flick it."

### Training mode (`"training"`)
- Human input **disabled** (pointer handlers early-return on mode check;
  `.arena.input-disabled` cursor).
- Auto-runner **stopped** (`Runner.stop`). The world advances **only** through
  `GameEnv.step(action)` — the RL bridge. See [api/GameEnv](../api/GameEnv.md).
- Aim assist greyed/disabled.
- Rendering still runs (independent RAF), so the state stays visible.

Switching modes cancels any in-flight drag.

## AI Aim Assist — Ghost Engine

Sub-toggle `#assist-toggle` (Normal mode only). When on, a standing green dotted
line previews a suggested shot; while dragging, the same mechanism previews the
player's *own* shot.

### How the preview is computed

1. `ensureGhostEngine()` builds a **second, invisible** Matter engine once. It
   has no `Render`; positions are only read out.
2. It **clones the arena's static geometry** (walls + bumpers) so ghost
   collisions match the real world exactly. (`Bodies.fromVertices`, with a circle
   fallback; restitution copied.)
3. `drawAimAssistTrajectory(vec)` places `ghostPuck` on the real puck, injects
   `vec` as velocity, and **fast-forwards `GHOST_TICKS` (170)** via
   `Engine.update`, sampling the position each tick.
4. The returned point array is drawn on the real canvas as a dotted line in the
   `afterRender` hook (`drawDottedPath`).

`computeDummyOptimalVector()` supplies the standing "optimal" suggestion (aim at
the top-goal center) — a stand-in a real solver or trained policy would replace.

## Overlay rendering (`afterRender`)

- While dragging: gray dashed **rubber band** from pointer to the puck center, a
  small ring at the pointer, a **powered ring** around the puck (green when the
  shot has force), and the green predicted trajectory.
- When idle + assist on: the standing suggested trajectory.

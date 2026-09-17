# API: `window.GameEnv` (headless RL bridge)

[← index](../index.md) · [modes](../concepts/modes.md)

Bridge for an external reinforcement-learning script. Designed for **Training
mode**, where the auto-runner is stopped and the agent drives stepping.
Coordinates are world/canvas pixels; origin top-left, +x right, +y down.

## `spec()`
Returns the static environment description:
```js
{
  width, height,                       // arena size in px
  actionSpace: { type:"box", shape:[2],
                 low:[-30,-30], high:[30,30] },   // ±FLICK_MAX_SPEED
  goals: { top:"left-scores", bottom:"right-scores" }
}
```

## `getState()`
Snapshot of the observable state:
```js
{
  mode,                                // "normal" | "training"
  score: { left, right },
  puck: { x, y, vx, vy, angle }
}
```

## `step(action, opts?)`
Applies an **impulse** (velocity) to the puck, then advances the sim.
- `action`: `{ vx, vy }` or `[vx, vy]`, clamped to ±`FLICK_MAX_SPEED`.
- `opts.substeps` (default 1): number of `Engine.update` ticks to advance.
- Returns `{ state, reward, done }`.
  - `reward`: `+1` if the puck scored in the top (target) goal this step,
    `-1` on an own goal (bottom), else `0`.
  - `done`: always `false` (episodes are externally managed).

```js
GameEnv.setMode('training');
GameEnv.reset();
const { state, reward } = GameEnv.step({ vx: 0, vy: -20 }, { substeps: 4 });
```

## `reset(opts?)`
Recenters the puck; zeros the score unless `opts.keepScore` is true. Returns
`getState()`.

## `setMode(mode)`
Programmatic mirror of the segmented control. `"normal"` | `"training"`.
Returns the resulting mode.

## Notes
- In Normal mode the runner also advances physics, so for deterministic
  agent control switch to Training first.
- The action is a target velocity (impulse from rest), not a per-tick force.

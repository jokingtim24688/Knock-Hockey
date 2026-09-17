# API: `window.KnockHockey` (test / tooling hook)

[← index](../index.md) · [physics](../concepts/physics.md)

Non-gameplay hook exposed for tests and external tooling. Gives read access to
live state and the pure slingshot math without going through the DOM.

## Shape
```js
window.KnockHockey = {
  CONFIG,                       // the full physics config object (see game-js.md)
  computeFlickVelocity(anchor, pointer),  // pure: → { x, y } impulse velocity
  toWorld(evt),                 // client coords → world coords (no offset)
  getDrag(),                    // { dragging, anchor, current }
  getPuck(),                    // { x, y, vx, vy }
  bounds: { W, H }              // arena size in px
}
```

## Uses
- **Math verification:** call `computeFlickVelocity({x,y}, {x,y})` and assert the
  direction/magnitude (see the Playwright suite in
  [physics#verification](../concepts/physics.md#verification)).
- **Coordinate/anchor checks:** after a real `mousedown` on the puck,
  `getDrag().anchor` must equal `getPuck()` center (proves zero offset).
- **Live puck read:** `getPuck()` for velocity/position during a sim.

## Stability note
This hook is intended for tests. Treat its surface as internal; prefer
[`GameEnv`](./GameEnv.md) for agent/automation control.

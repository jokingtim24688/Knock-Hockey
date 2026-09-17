# Concept: Physics model & slingshot math

[← index](../index.md) · [game.js](../files/game-js.md)

## Engine setup

- `Engine.create()` with `gravity = {x:0, y:0}` (top-down).
- `positionIterations = 10`, `velocityIterations = 10`, `constraintIterations = 4`
  for crisp, stable high-speed bounces.
- `Render` with `hasBounds:false` so world units map to CSS pixels **1:1**
  (origin top-left, +x right, +y down). This is what keeps the drag line
  perfectly anchored with no offset.

## The slingshot (impulse model)

Grab the puck, drag to pointer `P`. Let `A` be the puck anchor (frozen center).

```
pull     = A - P                       # opposite the drag = launch direction
distance = |pull|                      # how far you dragged
angle    = atan2(pull.y, pull.x)       # launch heading
speed    = clamp(distance * FLICK_GAIN, 0, FLICK_MAX_SPEED)
velocity = normalize(pull) * speed
```

The puck is held at `v = 0` while aiming, so `Body.setVelocity(puck, velocity)`
on release is a **pure impulse** `J = m · velocity`. Launch is exactly opposite
the drag; magnitude is proportional to drag distance (until clamped).
`distance < FLICK_DEADZONE (4px)` ⇒ zero (ignores accidental taps).

Implemented as the pure function `computeFlickVelocity(anchor, pointer)`.

## Anti-tunneling (no high-speed clipping)

Matter.js 0.19 has **no native continuous collision detection**; `isBullet:true`
is set on the puck as an intent/forward-compat flag but does nothing on its own.
The real guarantee is geometric:

```
max displacement per tick = FLICK_MAX_SPEED (30) < WALL_THICKNESS (80)
```

The puck can never move more than one wall-thickness in a single step, so it
cannot pass through a wall. Backed by 10 position/velocity solver iterations.

## Bounce & stop tuning

- Restitution: puck 0.9, walls 0.9, bumpers 1.0 → aggressive ricochet.
  (Matter uses the **max** restitution of a colliding pair.)
- `frictionAir = 0.012` → long glide that decays over a few seconds.
- Clean stop: an `afterUpdate` handler snaps `v → 0` when
  `|v| < STOP_THRESHOLD (0.09)` and not dragging, so the puck comes to a full,
  complete rest instead of drifting forever.

## Goals & scoring

`goalTop` / `goalBottom` are static **sensors** (fire collision events, no
physical response). On `collisionStart` with the puck: puck→top goal increments
`score.left`; puck→bottom increments `score.right`; then `recenterPuck()`.

## Verification

Headless Playwright suite (all pass, no console errors):

| Test | Result |
|------|--------|
| Slingshot math (distance/angle/clamp/deadzone, 4 cases) | exact |
| Drag anchor == puck center (no offset) | pass |
| Pointer follows mouse (world == client-rect) | pass |
| Real DOM flick matches impulse math | cosθ = 1.000, |v| within tol |
| No tunneling — 400 ticks max-speed wall ramming | never escaped box |
| Ricochet (direction reversal observed) | pass |
| Complete stop after flick | final speed == 0 |

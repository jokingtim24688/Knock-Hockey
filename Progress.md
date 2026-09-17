# Progress — Knock Hockey Prototype

## Context notes
- Repository was empty at session start (no commits, no `graphify-out/` directory).
- User preference is to query the graphify knowledge graph (`graphify-out/wiki/index.md`), but **no graphify output exists in this repo yet**, so there is nothing to query. Proceeding with a greenfield build.
- Branch: `claude/intelligent-shannon-7pgma3`

## Task
Build a complete 2D physics **Knock Hockey** prototype (HTML + CSS + Matter.js) that runs in a desktop browser but is structurally constrained to look/behave like an iOS mobile app.

## Requirements checklist
- [x] Sketch/wireframe visual style (solid colors, basic shapes)
- [x] "Phone" container: exactly 390px × 844px, centered on a dark page
- [x] Computer-vision anchors: 10×10px `#FF00FF` squares in all four absolute corners
- [x] Fake multiplayer header: two player circles + scoreboard (0 - 0)
- [x] No betting / wagering / gambling UI or mechanics
- [x] Overlay `<div>` menu inside phone container
- [x] Mode Toggle: Training vs Normal
- [x] Training Mode: disables human input, activates headless `GameEnv.step(action)`
- [x] Normal Mode: enables drag-and-release slingshot
- [x] Normal Mode sub-toggle: "AI Aim Assist" (ghost trajectory)
- [x] Matter.js engine, top-down, zero gravity
- [x] Static walls matching container bounds + central bumpers
- [x] Puck with high restitution + tuned frictionAir
- [x] Human flicking (drag-and-release), Normal Mode only
- [x] `drawAimAssistTrajectory(suggestedVector)` placeholder + ghost-engine comments
- [x] Global `GameEnv` with `getState()`, `step(action)`, `reset()`

## Files
- `index.html` — phone container, header, canvas, overlay menu, CV anchors
- `styles.css` — dark page, wireframe styling
- `game.js` — Matter.js engine, physics, slingshot, aim assist, GameEnv API

## Status
- [x] Files written
- [x] Committed
- [x] Pushed to `claude/intelligent-shannon-7pgma3`
- [x] Published as interactive Artifact

## Refinement pass (design polish + physics fix/test)
Mechanic reframed per request: the slingshot now flicks **the puck directly**
(drag anchors to the puck, impulse applied to the puck on release).

### UI/design polish
- Frosted-glass "CONTROLS" mod-menu (`backdrop-filter: blur`), rounded 20px,
  hairline borders, system (SF/iOS) font stack, collapsible.
- iOS segmented control with a sliding thumb (Normal ⇄ Training).
- iOS-style toggle for AI Aim Assist (greys out + disables in Training).
- Polished header: gradient avatars w/ initials, centered scoreboard pill,
  tabular-nums, proper padding via CSS grid.
- Magenta 10×10 CV anchors left EXACTLY in the four corners (untouched).

### Physics — implemented
- Direct-puck slingshot: `velocity = normalize(anchor − pointer) *
  clamp(distance * FLICK_GAIN, 0, FLICK_MAX_SPEED)`; puck frozen while aiming
  so `setVelocity` is a pure impulse. Deadzone ignores micro-drags.
- `isBullet: true` set on the puck (intent/forward-compat; Matter 0.19 has no
  native CCD). Real anti-tunneling: speed cap (30) < wall thickness (80) so the
  puck can't cross a wall in one tick, plus 10 position/velocity iterations.
- Tuned `restitution` (puck 0.9 / walls 0.9 / bumpers 1.0) + `frictionAir`
  (0.012) with a `STOP_THRESHOLD` snap for a clean, complete stop.
- Coordinate mapping fixed/verified: world == CSS px 1:1 (`hasBounds:false`);
  drag band anchors to puck center, pointer tracks mouse with no offset/lag.
- `GameEnv.step` now applies the impulse to the puck.

### Physics — tested (Playwright, all PASS, no console errors)
- Slingshot math exact for distance/angle/clamp/deadzone (4 cases).
- Anchor == puck center (no offset); pointer follows mouse exactly.
- Real DOM flick matches impulse math (cosθ = 1.000, |v| within tol).
- No tunneling under 400 ticks of max-speed wall ramming (never escapes box).
- Ricochets (direction reversal observed) then stops COMPLETELY (speed == 0).

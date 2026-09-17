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

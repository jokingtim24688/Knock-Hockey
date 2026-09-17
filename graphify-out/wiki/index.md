# Knock Hockey — Knowledge Graph Wiki

> Generated knowledge base for the Knock Hockey prototype. Query this first
> (per project convention) before reading raw source files.
>
> **Last generated:** 2026-09-17 · **Branch:** `claude/intelligent-shannon-7pgma3`
> **Machine-readable graph:** [`graph.json`](./graph.json)

## What this project is

A 2D physics **Knock Hockey** prototype built with plain HTML/CSS + **Matter.js**.
It runs in a desktop browser but is structurally constrained to look and behave
like an **iOS mobile app** (fixed 390×844 "phone" frame, iOS-style chrome). The
player flicks a **puck** directly with a drag-and-release slingshot; the puck
ricochets off walls/bumpers and scores in goals. A headless `GameEnv` API lets
an external RL agent drive the puck in a "Training" mode.

There is **no** betting/wagering/gambling content anywhere (explicit exclusion).

## Repository map

| File | Role | Wiki page |
|------|------|-----------|
| `index.html` | Phone container, CV anchors, header, canvas, overlay menu | [files/index-html](./files/index-html.md) |
| `styles.css` | Premium dark / iOS-flavored styling (frosted glass, segmented control) | [files/styles-css](./files/styles-css.md) |
| `game.js` | Matter.js engine, slingshot physics, aim assist, `GameEnv` bridge | [files/game-js](./files/game-js.md) |
| `matter.min.js` | Vendored Matter.js 0.19.0 (offline; CDN blocked by proxy policy) | — |
| `Progress.md` | Running progress log | — |

## Start here

- **Architecture & relationships:** [architecture.md](./architecture.md)
- **Physics model + slingshot math:** [concepts/physics.md](./concepts/physics.md)
- **Modes & AI aim assist:** [concepts/modes.md](./concepts/modes.md)
- **Headless RL API:** [api/GameEnv.md](./api/GameEnv.md)
- **Test/tooling hook:** [api/KnockHockey.md](./api/KnockHockey.md)

## Quick facts (nodes)

- **Globals exposed on `window`:** `GameEnv` (RL bridge), `KnockHockey` (test hook), `Matter` (engine lib).
- **Dynamic bodies:** exactly one — the `puck`. Everything else is static (walls, bumpers) or a sensor (goals).
- **Modes:** `normal` (human slingshot; auto-runner drives physics) and `training` (input disabled; world advances only via `GameEnv.step`).
- **Key invariant — no tunneling:** `FLICK_MAX_SPEED (30)` < `WALL_THICKNESS (80)`, so the puck can never cross a wall in one tick.
- **Key invariant — clean stop:** an `afterUpdate` snap zeroes puck velocity below `STOP_THRESHOLD (0.09)`.
- **Coordinate system:** world units == CSS pixels 1:1 (`render.options.hasBounds = false`); origin top-left of the arena, +x right, +y down.

## Verification status

Physics verified with a headless Playwright suite (all pass, no console errors):
exact slingshot math, zero coordinate offset (drag anchor == puck center),
DOM flick matches impulse math (cosθ = 1.000), no tunneling under max-speed wall
ramming, aggressive ricochet followed by a complete stop (speed == 0).
See [concepts/physics.md](./concepts/physics.md#verification).

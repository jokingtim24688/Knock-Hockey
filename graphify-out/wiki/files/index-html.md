# File: `index.html`

[← index](../index.md)

Defines the fixed "phone" DOM. `game.js` reads these nodes by id/class.

## Structure

```
#phone (390×844, .phone)
 ├─ .cv-anchor.cv-tl / .cv-tr / .cv-bl / .cv-br   ← 10×10 #FF00FF CV anchors (DO NOT ALTER)
 ├─ header.hud
 │   ├─ .player.player-left  (.avatar.avatar-1 "A", .player-name "Alex")
 │   ├─ .scoreboard (#score-left, .score-sep, #score-right)
 │   └─ .player.player-right (.avatar.avatar-2 "J", .player-name "Jordan")
 ├─ #arena (.arena)
 │   └─ #game-canvas          ← Matter.Render target
 └─ #overlay (.overlay)       ← frosted mod-menu
     ├─ #overlay-handle (collapse toggle: .handle-dot/.handle-title/.handle-chevron)
     └─ #overlay-body
         ├─ #mode-seg (.segmented, data-active) : #seg-thumb, #mode-normal, #mode-training
         ├─ #assist-row : #assist-label, #assist-toggle (.switch/.slider)
         ├─ #reset-btn (.ghost-btn)
         └─ #mode-hint
```

## DOM contract used by `game.js`

| Selector | Used by | Purpose |
|----------|---------|---------|
| `#arena` | render sizing, `toWorld`, cursor state | world dimensions W×H; pointer→world mapping |
| `#game-canvas` | `Render.create`, pointer listeners | canvas + mousedown/touchstart |
| `#score-left` / `#score-right` | `updateScoreboard` | scoreboard text |
| `#mode-seg` + `[data-active]` | `setMode` | drives the segmented thumb slide |
| `#mode-normal` / `#mode-training` | `wireUI`, `setMode` | mode buttons + active class |
| `#assist-toggle` / `#assist-row` | `wireUI`, `setMode` | aim-assist enable/disable |
| `#reset-btn` | `wireUI` | reset puck |
| `#overlay` / `#overlay-handle` | `wireUI` | collapse/expand menu |
| `#mode-hint` | `setMode`, `wireUI` | contextual instructions |

## Invariants

- The `#phone` box is **exactly** 390×844 (see `styles.css`).
- The four `.cv-anchor` squares are pure `#FF00FF`, 10×10, pinned to absolute
  corners at `z-index:9999`. **Must not be altered** (external OpenCV mapping).
- Scripts load in order: `matter.min.js` then `game.js`.

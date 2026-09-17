# File: `styles.css`

[← index](../index.md)

Premium dark / iOS-flavored styling. Sketch-simple playfield, finished-app chrome.

## Design tokens (`:root`)

- Sizes: `--phone-w: 390px`, `--phone-h: 844px`, `--hud-h: 88px`.
- Palette: `--bg-0 #05060a`, `--field #0d1017`, `--ink #f2f4f8`, `--ink-dim #8b909c`,
  hairlines `--hair` / `--hair-2`.
- iOS accents: `--ios-blue #0a84ff`, `--ios-green #30d158`, `--ios-orange #ff9f0a`,
  `--ios-red #ff453a`, `--ios-track` (segmented/track gray).
- `--magenta #ff00ff` — CV anchor color, **exact, do not change**.
- `--font` — system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", …`)
  for authentic iOS feel (deliberately not Inter).

## Key rules

- `.phone` — fixed 390×844, `overflow:hidden`, drop shadow. Plain rectangle
  (no border-radius) to keep CV bounds clean.
- `.cv-anchor` — 10×10 `--magenta`, `z-index:9999`, `pointer-events:none`;
  corners via `.cv-tl/.cv-tr/.cv-bl/.cv-br`.
- `.hud` — CSS grid `1fr auto 1fr`; frosted via `backdrop-filter: blur(18px) saturate(160%)`.
- `.avatar-1/.avatar-2` — gradient circles with initials; `.scoreboard` is a
  rounded pill with `tabular-nums`.
- `.arena` — `touch-action:none` so the game owns drag gestures; canvas has a
  subtle radial-gradient field.
- `.overlay` — frosted mod-menu: `backdrop-filter: blur(26px) saturate(180%)`,
  20px radius, hairline border, layered shadow; `.collapsed` collapses the body.
- `.segmented` + `.seg-thumb` — iOS segmented control. Thumb is absolutely
  positioned at 50% width and slides via
  `.segmented[data-active="training"] .seg-thumb { transform: translateX(100%); }`.
- `.switch`/`.slider` — iOS toggle; checked turns `--ios-green` and slides the knob.
- `.ghost-btn`, `.mode-hint` — secondary button + centered hint text.

## Notes for editors

- Changing `--phone-w/h` breaks the 390×844 requirement — don't.
- `backdrop-filter` needs a translucent background to show blur; both `-webkit-`
  and standard properties are set for Safari/iOS.

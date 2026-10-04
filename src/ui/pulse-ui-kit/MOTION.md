# Pulse — motion & depth spec

The rules behind every moving thing in Pulse. Values live in `tokens/tokens.css`; this file says what they are for. Adapted from the motion language of [rampstackco/glassmorphism-theme](https://github.com/rampstackco/glassmorphism-theme) (MIT), recoloured and extended for Pulse.

## The one gesture

A surface rises toward the reader on hover and its shadow grows to match. Pressing puts it back down. That's the whole system — everything else is a variation.

| State | Transform | Shadow | Notes |
|---|---|---|---|
| Rest | none | tier 1 (buttons, choices) · tier 2 (cards) | |
| Hover | `translateY(-3px)` | tier 3 | edge strengthens on cards and choices |
| Press (`:active`) | back to `0` | tier 1 | the press must read differently from hover |
| Focus (keyboard) | none | unchanged | 2px ring in `--pl-ring`, offset 2px |
| Disabled | none | none | opacity .45, `cursor: not-allowed`, stays in tab order |

Timing for all of it: **220 ms, `cubic-bezier(0.2, 0.6, 0.2, 1)`** — slower than a click response on purpose: this is atmosphere, not feedback. The travel is small (3px) because the shadow does the work.

## Shadow tiers

Offset ≈ a third of the blur, both growing together — the geometry of a soft area light.

| Tier | Light themes (navy ink) | Dark theme (near-black) |
|---|---|---|
| 1 | `0 2px 8px` @ 8 % | `0 2px 8px` @ 28 % |
| 2 | `0 12px 32px` @ 10 % | `0 12px 32px` @ 40 % |
| 3 | `0 24px 64px` @ 18 % | `0 24px 64px` @ 52 % |

Shadows are earned by interaction: at rest, things sit close to the page.

## Per component

- **Primary button (gold)** — opaque, never glass: a translucent call to action would change contrast with the scroll position. Top catch-light at 35 % white. One per view.
- **Secondary** — solid navy on light grounds; on dark grounds it becomes *the glass button* (10 % white, 60 % white edge, 68 % catch-light).
- **Ghost** — no surface at rest. On hover a fill, an edge and a tier-1 shadow fade in: the hover is how the reader learns it was a control.
- **Link card** — rise, edge strengthens (frosted: white 95 % → navy 30 %; dark: white 30 % → 60 %), tier 2 → 3, and a **pointer sheen**: a 380px radial light that follows the cursor, painted *under* the text (gold 14 % on light, white 12 % on dark). An arrow inside nudges 3px right.
- **Answer choice (test, exercises)** — same rise as a card. The chosen option takes a gold edge + a 1px gold ring, and the radio stays visible: never colour alone.
- **Input / search** — a recessed **well** (inner shadow) at rest; on focus it rises level with the page (fill brightens, inner shadow replaced by tier 1) and the ring appears.
- **Nav item** — ink, fill and edge fade in on hover; the current page keeps the fill and gains the gold bar.
- **Rows** (raw results, lists) — a background fades in; no rise (lists would jitter).
- **Wells / recessed cards** — never lift.

## Pulse signature moves

1. **Pointer sheen** on link cards (above).
2. **Heartbeat line** — Pulse's mark, a gold dash running along the bottom edge of a *live* panel (test open, session running). 3.4 s loop. Only on live states, never decorative.
3. **Staggered rise on load** — blocks enter 10px lower and transparent, 600 ms, 80 ms apart (`.pl-enter` with `--i: 0,1,2…`). Animates each block's own transform, so it never breaks a parent's blur.
4. **Live dot** — a 7px dot with a ping ring inside a status pill, for "live now" only.

## Glass rules (light C′ and dark themes)

- **Tiers**: white 6 / 10 / 14 % with blur 12 / 20 / 32px and saturate 1.6 — alpha and blur rise together, so a tier reads as a distance.
- **One backdrop-filter per stack.** Tiles inside a blurred hero don't blur (hybrid is the exception: its hero is opaque, so its tiles can).
- **A surface over content takes a scrim, not a tier.** The sticky top bar in dark is 72 % deep navy before any glass.
- **Edges are drawn**, not implied: a translucent fill can't carry its own boundary.
- **One glow per screen**, reserved for where the AI speaks (V2+).
- Never fade a panel with `opacity` on an ancestor: it silently kills the blur of everything inside.

## Accessibility branches (shipped in tokens.css)

- `prefers-reduced-motion` → lift 0, load animation off, heartbeat and ping stopped. **Shadow changes stay**, so hover still reads.
- `prefers-reduced-transparency` → no blur, no glows, opaque surfaces in the same order.
- `prefers-contrast: more` → glass retired, solid surfaces, stronger edges and muted ink.
- Touch targets ≥ 44px everywhere; inputs at 16px on phones (stops iOS zoom).

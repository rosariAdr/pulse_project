# Pulse UI kit

The chosen Pulse look — **C′: frosted white glass over a navy graph-paper grid on warm white** — plus the two variations kept for later (**hybrid** and **dark**), packaged for the React + Vite + Tailwind repo. Decided by Adrian and Parv on 26 Sep 2026 from the "Glass Motion exploration" canvas.

```
pulse-ui-kit/
├─ tokens/tokens.css        every value, three themes, accessibility branches
├─ tokens/tokens.json       the same tokens as data (Claude Design / tooling)
├─ styles/ground.css        the lit ground: base + 3 soft lights + grid
├─ styles/components.css    pl-* components with the hover gesture wired in
├─ tailwind/theme.css       Tailwind v4 bridge (utilities follow the theme)
├─ react/                   typed React components + ThemeProvider + sheen hook
├─ demo/index.html          open in a browser: all three themes, desktop + 390px
└─ MOTION.md                the motion & depth spec (read before animating anything)
```

## Wire it in (Vite + React + Tailwind v4)

1. Copy `pulse-ui-kit/` to `src/ui/pulse-ui-kit/`.
2. `src/index.css`:
   ```css
   @import "tailwindcss";
   @import "./ui/pulse-ui-kit/tokens/tokens.css";
   @import "./ui/pulse-ui-kit/styles/ground.css";
   @import "./ui/pulse-ui-kit/styles/components.css";
   @import "./ui/pulse-ui-kit/tailwind/theme.css";
   ```
   Order matters: tokens → ground → components.
3. Fonts, in `index.html` `<head>`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap">
   ```
4. Wrap the app: `<ThemeProvider initial="light"><App/></ThemeProvider>` and build screens from `AppShell`, `Button`, `LinkCard`, `Choice`, `TextField`, `StatusPill`, `Panel`, `Tile`, `Progress` (`react/index.ts`).

## Themes

| `data-theme` | What it is | Status |
|---|---|---|
| `light` | C′ — frosted white cards, smoked-navy sidebar and hero, navy grid on warm white | **Default** |
| `hybrid` | B — paper cards, glass only in sidebar + hero (their own lit ground) | Kept as a variation |
| `dark` | C — glass everywhere over lit navy | Future dark mode, opt-in |

Switching is `document.documentElement.dataset.theme = "dark"` (the `ThemeProvider` does it and remembers the choice). Dark is **not** tied to `prefers-color-scheme` yet — turn that on only after testing it on real phones in class.

## Rules of use

- **Colours**: navy / gold / sage + one AI cyan. Gold = primary action and the active nav bar. Sage = progress, handed in, approved. Risk red = rejected / not working only. **Cyan only where an AI speaks** — Pulse has no AI in V0/V1, so cyan stays unused until V2 (focus rings excepted).
- **Status = colour + a word**, always (`StatusPill`).
- **One primary button per view.**
- Anything that moves uses a `pl-*` class — the gesture is already wired. Tailwind utilities are for layout.
- Never put `opacity` < 1 or `filter` on an ancestor of a glass surface (kills the blur).
- Coloured text never sits directly on glass — use a pill.
- Mobile-first: test-day screens are designed at 390px; inputs stay 16px on phones.

## What's verified

- `react/` type-checks under TypeScript 5 strict (`noUnusedLocals`).
- `demo/index.html` rendered in Chromium at 1440px (light / hybrid / dark) and 390px; hover states checked.
- Text contrast measured against the worst ground pixel per theme (see the header of `tokens.css`).

Not yet done: no unit tests for the components, no Storybook, no visual-regression baseline.

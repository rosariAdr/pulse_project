# CLAUDE.md — Pulse

> Bridge file between the Notion Second Brain and this repo. **Regenerate it whenever the Decision Log changes.** Generated 2026-10-03 from: Claude Operating Guide, Decision Log (newest entry 3 Oct 2026: design direction + V0 decisions), Roadmap, Build Plan V0, Website Documentation, Data Architecture, Page Framework v10.

## What Pulse is

A teacher-owned pre/post-class diagnostic for higher education. *Pulse* is a working name. Creator: **Parv Kaur**. Built with **Adrian Rosari**.

The loop is **Diagnose → Teach → Reinforce → Remeasure**. V0 proves the first half on the founders' own classes:

- Students take an **entrance test during the first class**, on their phones.
- They see **only their own results**.
- The teacher reads the **raw results**.

There is no commercialization before extended real-world proof.

## Source of truth

1. Notion **🧾 Decision Log** — the newest entry wins.
2. Notion topic pages: 🗺️ Page Framework v10, 🏗️ Website Documentation, 🗄️ Data Architecture, 🔨 Build Plan V0.
3. This file.
4. The approved mockups in `/design`.

If code and these disagree, stop and flag it — never silently pick one. Anything Claude invents to fill a gap is tagged `💡 [Claude-proposed — to validate]` in docs/PRs.

## V0 scope (framework v10) — build exactly this

**The door**
- Sign in.
- First visit: create the account from a profile that **already exists**. The email is recognised and the student chooses a password.
- Password reset.
- No module link, no welcome email, no self-enrollment.

**Student**
- Home, My modules, Module page.
- **Entrance test**: 15–20 min, one attempt, autosave and resume, a hand-in confirmation that shows no results. Handing it in unlocks the module.
- **My results**: own results only, with general advice or a preview.
- Session page: the teacher's materials and that session's exercises.
- Exercises: answers go to raw results.
- My progress.

**Teacher** (in V0 this is a facet of the master account)
- Home, My modules.
- Create the entrance test, with draft / published states and versioning.
- Set up the sessions.
- Prepare a session: drop content, add exercises. Answers are optional.
- **Raw results**: a per-class list of each student's answers, with CSV export.

**Master account** (the founders — the only role in V0)
- Create modules (with a session count).
- Create classes and their student profiles (name + email).
- Attach classes to modules.

**Not in V0** — don't build, don't stub visibly:
- AI of any kind.
- The publish check.
- Feedback sum-up.
- Companion chat (V1: predetermined Q&A).
- Priced advice.
- Separate teacher accounts.
- Participation grade.
- LTI.
- Dark mode by default.

## Stack & layout

- **React + Vite + TypeScript + Tailwind v4**, deployed on **Vercel** (a preview per branch).
- **Supabase in an EU region, Free plan** (decided 3 Oct 2026) for data and auth. The plan allows 2 active projects: exactly **dev + prod**, no third.
  - Projects pause after 1 week without activity → `.github/workflows/keep-alive.yml` calls `public.ping()` daily. Still open the app the day before each class.
  - No automatic backups and no point-in-time recovery → `.github/workflows/backup.yml` dumps prod nightly, encrypted, kept 30 days.
  - Limits to watch: 500 MB database, 1 GB file storage, 5 GB egress. Keep session materials light (PDFs, not videos).
- **Zero serverless functions in V0**: the Supabase client plus RLS does everything.
- Icons: lucide. Fonts: Source Serif 4 + IBM Plex Sans (Google Fonts).

```
src/
  ui/pulse-ui-kit/      design system (tokens, ground, components, Tailwind bridge, React parts) — see its README + MOTION.md
  i18n/en.ts            every interface string (English shell)
  data/                 the ONLY place that talks to Supabase (repository layer; mirrors the prototype's PulseData.repo method names)
  features/door|student|teacher|master/
supabase/
  migrations/           schema + RLS (v10 model) — every change is a new migration
  seed.sql              fictional demo class (dev only)
  tests/rls.test.sql    pgTAP: the data rules, proven (36 assertions)
.github/workflows/      ci.yml (lint + tsc + build + pgTAP on every PR) · keep-alive.yml · backup.yml
design/                 approved Claude Design exports — implement FROM these, not from prose
```

Commands: `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test` (unit + component) · `npm run test:e2e` (Playwright) · `npm run test:all` · `npm run db:start` · `npm run db:reset` (migrations + seed) · `npm run db:test` (RLS tests). The Supabase CLI is a devDependency and `supabase/config.toml` is committed — the database commands need Docker running.

## Branches (decided 5 Oct 2026)

- **`main`** — always deployable, Vercel **production**, the version a real class uses. Nothing is committed to it directly: it only ever receives `dev`.
- **`dev`** — the integration branch, Vercel **preview**. Work lands here first and stays until it has been seen working.
- **`feat/…` · `fix/…` · `chore/…` · `docs/…`** — short-lived, cut from `dev`, merged back into `dev` through a pull request. Delete the branch once merged.

A release is a pull request from `dev` to `main`, opened when the loop works on the demo class and CI is green. Never merge `main` into `dev` to "catch up" — if they diverge, something was committed to `main` that should not have been.

CI (lint, types, unit, end-to-end, pgTAP) runs on every pull request and on every push to `dev` and `main`. A red CI is never merged.

Environments follow the branches: **`main` → the prod Supabase project · `dev` and previews → the dev project**, through Vercel's per-environment variables. A preview must never point at production data.

## Tests

Four layers, described in `docs/testing.md`: the data rules (pgTAP) · the repository (Vitest) · the screens (Vitest + Testing Library) · the journeys (Playwright, laptop **and** phone). The end-to-end tests run on the built app with `VITE_DATA_SOURCE=fake`, so they need no project and no secret.

Own-results-only is proven by the database tests and nowhere else — the in-memory repository imitates the rule so screens behave the same, but it is a development double, never a security boundary. Any change to RLS needs a migration **and** a test in the same pull request.

## Data rules (enforced in the database — keep it that way)

The model is classes → student_profiles → class_modules → modules → sessions → exercises → answers, plus tests → test_questions → attempts.

- **No self-enrollment.** A trigger on `auth.users` only lets an account be created when the email matches a pre-created `student_profiles` or `staff_accounts` row. Anything else raises `PULSE_NO_PROFILE`.
- **Own results only.** RLS scopes every student read and write to their own profile(s). The master account reads everything.
- **One attempt per student per test** (unique constraint). Answers can be edited only while the attempt is open: not handed in, within time + 2 min. Hand-in uses the server's clock and cannot be undone.
- **Published tests are frozen.** Questions can't change, and a test can't return to draft. Publish a new version instead.
- **Late exercise answers count** (decided 3 Oct 2026). An exercise answered after the next session opens is accepted, flagged `late` by a trigger, counted in the student's private progress and marked late in raw results. An answer given **on time** is the teacher's report line: it freezes once the next session opens (`PULSE_REPORT_FROZEN`). Late answers stay editable. Deadline = start of the next session's scheduled day, Europe/Paris (`exercise_deadline()`).
- **Answer keys and advice** sit in `exercise_keys` / `test_question_keys`, which students can't read.
- **Two hierarchies never merge.** Content (module → session → exercise) never carries school/class/group ids.
- Any change to these rules needs a migration **and** a test in `supabase/tests/`. Run `supabase test db` before every PR that touches SQL (CI runs it too).
- Supabase grants `anon` on new tables by default: **every migration that creates a table must enable RLS and `revoke all … from anon`.**

## Design system — Pulse — Glass

Decided by Adrian + Parv on 26 Sep 2026.

**Themes — two, and only two (decided 4 Oct 2026)**
- `hybrid` = **our light mode, the default**: paper cards; glass only in the sidebar and hero.
- `dark` = **our dark mode**: glass everywhere over lit navy. Offered by a toggle, not tied to `prefers-color-scheme` yet (test it on real phones in class first).
- The kit's `light` (C′) theme stays in `tokens.css` as a variation but **the app never selects it**: `PulseTheme` is `"hybrid" | "dark"`, `index.html` ships `data-theme="hybrid"`, and `ThemeProvider` carries `toggleTheme()`. Don't reintroduce C′ without a Decision Log entry.

The full spec is `src/ui/pulse-ui-kit/README.md` and `MOTION.md`. Design System artifact: https://claude.ai/artifact/LueUu8ycgUqosSBvZgdwMt

**Rules**
- **The one gesture.** On hover a surface rises 3px and its shadow grows from tier 1 to tier 3. Press puts it back. Everything runs at 220 ms with `cubic-bezier(.2,.6,.2,1)`. Use the `pl-*` classes (the motion is already wired); use Tailwind utilities for layout only.
- **Colour meaning.** Gold = the next step (one primary button per view) and the active nav. Sage = progress / handed in. Risk red = closed or destructive only. **AI cyan only where an AI speaks** — nothing in V0/V1, except focus rings.
- **Status = colour + a word**, always.
- **Mobile-first for the student test day** (390px). Inputs are 16px on phones and targets at least 44px.
- **Glass.** Never put `opacity` < 1 or `filter` on an ancestor of a glass surface (it kills the blur). Use one blur per stack.
- **Accessibility.** Text reaches 4.5:1 against the worst ground pixel. Honour reduced motion, reduced transparency and more contrast (already handled in tokens.css).

## Build order (Build Plan, step 2)

Work in this order:

1. Data layer
2. The door
3. Student test journey
4. Teacher module space
5. Raw results
6. Master screens

Run each block against the seeded demo class. The founders' provisioning can be done by hand with the seed or provisioning script until the master screens exist.

**Definition of done** for each task:
- It works on the seeded demo class.
- It follows the design system.
- It respects own-results-only.
- The RLS tests are green.
- The lint + TypeScript + build GitHub Action is green.
- The Scrum Board status is updated.
- Any decision taken is logged in the Decision Log.

## Never

- Merge Pulse with Tremplin in any way.
- Put school/batch/group identifiers into content tables.
- Add emotion or attention inference (EU AI Act Art. 5(1)(f)).
- Blend the two participation signals into one score (V1+).
- Edit a live test or taxonomy in place — version it.
- Show a student another student's data, rankings or comparisons.
- Describe Parv and Adrian's roles differently from the Second Brain, or merge their institution lists.
- Commit secrets. Supabase keys live in Vercel env vars and `.env.local` (git-ignored). Only the anon key is used in the browser.

## Content conventions

- **Interface language is English** (decided 3 Oct 2026): navigation, buttons, labels, messages and errors. Keep every UI string in `src/i18n/en.ts` so a French shell can be added later without a hunt.
- Content language follows the course: English by default; *Statistiques commerciales* (IDRAC B1) and *RSE* (ABS MPF2) are in French.
- Asset naming: `Subject_Level_Session_Topic_ExN` (e.g. `ExcelAdvanced_Bachelors_S3_PivotTables_Ex2`).
- All demo data is fictional and labelled as such in the UI.

## Decided for V0 (3 Oct 2026)

- Interface language: **English** (see Content conventions).
- Supabase: **Free plan** (see Stack & layout for the consequences).
- Late exercise attempts: **count in the student's private progress** (see Data rules).

## Still open (don't guess — ask)

- **Pilot module(s)** and the real entrance test (Parv).
- **Data-retention policy** and the student privacy notice: required before the first real pilot.

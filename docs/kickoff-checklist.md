# Pulse V0 — what's left before development starts

*Status as of 3 Oct 2026. The board numbers are tasks from the Notion Scrum Board.*

## Ready (this kit)

- **Design direction decided**: C′ light, with hybrid and dark as variations. It exists as the Design System *Pulse — Glass*.
- **UI kit** in `src/ui/pulse-ui-kit/`:
  - tokens for the 3 themes, the ground, the components with the hover motion, a Tailwind v4 bridge, typed React parts, a demo page, and the motion spec.
  - Covers board tasks "Design tokens + type pair into the repo", "Extract the Pulse tokens and components" and "App shell as reusable components" (first pass).
- **CLAUDE.md**: Build Plan step 0, regenerated from the Second Brain.
- **Supabase v10 schema + RLS + seed + 36 pgTAP tests**, all passing locally (including the late-answer rule and the keep-alive ping).
- **GitHub workflows**: CI (lint + TypeScript + build + pgTAP), daily keep-alive, nightly encrypted backup of prod.
  - Covers "Supabase schema (v10) + seeded demo class", "Automated tests of the RLS rules", "One attempt per student per test" and the database half of "Published / not-published state for a test + versioning".

## 1. Decide (blocks screens or the pilot)

- [x] **Interface language: English** (3 Oct 2026). Course content keeps its own language.
- [x] **Supabase: Free plan** (3 Oct 2026). Dev + prod only; keep-alive and backup workflows cover pausing and the missing backups.
- [x] **Late exercise attempts count** in a student's private progress (3 Oct 2026). Flagged `late`; on-time answers freeze at the next session.
- [ ] **Pilot module(s)** and the **real entrance test**. Parv owns this; it's the critical path, because there's no pilot without a test.

## 2. Set up (Adrian, about half a day)

- [ ] Git on both founders' machines; protect `main` and require a pull request.
- [ ] Copy this kit into the repo: `CLAUDE.md`, `src/ui/pulse-ui-kit/`, `supabase/`, `design/`, `docs/`.
- [ ] Scaffold the app if it isn't there yet: Vite + React + TypeScript + Tailwind v4, then wire the kit as its README says.
- [ ] Two Supabase projects in an **EU region** (dev and prod). Then `supabase init` → `supabase db reset` → `supabase test db` (expect 36/36) → `supabase db push` to dev.
- [ ] Vercel environment variables (Supabase URL + anon key) for preview and production.
- [ ] Push `.github/workflows/` (already written) and add the six GitHub secrets listed in `supabase/README.md`. Run *Keep Supabase awake* and *Nightly backup* once by hand to check them.
- [ ] Storage bucket `session-materials` and its policies (the next migration).

## 3. Design (Claude Design, before any screen is coded)

- [ ] In Claude Design, set **Pulse — Glass** as your default design system.
- [ ] Journey 1 — **student test day**, mobile-first at 390px: sign in → claim profile → module page / test intro → question flow → hand-in confirmation → my results.
- [ ] Review it together (Adrian + Parv), then export it to `/design/01-test-day/`.
- [ ] Journey 2 — the teacher prepares. Journey 3 — the master account prepares.
- Watch out: the exploration canvas shows approvals and a companion. Those are V1/V2 and must not appear in the V0 journeys.

## 4. Build (Claude Code, in this order)

1. Data layer (`src/data/`, ported from the prototype's `PulseData.repo`)
2. The door, including password reset
3. Student test journey, with autosave and resume
4. Teacher module space
5. Raw results, with CSV export
6. Master screens

Then run the impeccable pass on the working student flow.

## 5. In parallel (needed before the pilot)

- [ ] Student privacy notice and the data-retention policy.
- [ ] Sign Supabase's data-processing agreement and list the subprocessors.
- [ ] A one-page sign-in guide for students, plus the pilot-day runbook.
- [ ] Dry run: about 25 fake students on real phones, in the room.
- [ ] A stable URL (domain + Vercel); rehearse one restore of a nightly backup onto the dev project.

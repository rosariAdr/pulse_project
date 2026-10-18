# Finishing V0 — design

*18 October 2026. Implements the brief validated on 20 September (the entrance-test
loop) and every decision taken since. The plan that executes it is
`docs/superpowers/plans/2026-10-18-v0-finish.md`.*

## 1. What V0 is

The entrance-test loop, on the founders' own classes:

1. The master account provisions classes, student profiles and modules (by
   script — `scripts/provision.mjs` — not by screens).
2. The teacher writes an entrance test inside a module and publishes it.
3. In the first class, each student signs in on their phone (first visit: claims
   the profile that already exists), opens the module, takes the test — answers
   saved as they are written — and hands it in. The hand-in screen shows no
   result.
4. The teacher reads the raw answers, by question or by student, and exports a CSV.

Everything else that the framework v10 once called "V0" — session pages, content
drop, exercises, my progress, my results, master screens — is **V1**
(decision of 20 September, recorded by Task 2).

## 2. Where it stands (18 October)

| Part | State |
|---|---|
| Screens of the loop | Built, 60 unit/component tests, 18 end-to-end (laptop + phone) |
| Data layer | One interface, two implementations; only the in-memory one is exercised |
| Database | v10 schema + hardening migration, 54 pgTAP assertions written |
| CI | Has not completed a run since 5 October (GitHub runner incident, then nothing) |
| Supabase projects | Not created |
| Missing for a real class | Supabase projects; proof that `createSupabaseRepo` works; the "new password" screen behind the reset link; the real test; the privacy notice; the pilot-day kit |

## 3. The work that remains

| # | Task | Owner | Needs |
|---|---|---|---|
| 0 | Manual setup | Adrian | — |
| 1 | CI green on `dev` | agents | Task 0 (gh) |
| 2 | Scope correction: Decision Log entry + `CLAUDE.md` | agents | Adrian's approval of Appendix A of the plan |
| 3 | Guardrails as code: secret scan, `npm run verify`, PR template, per-run e2e port | agents | 1 |
| 4 | "New password" screen behind the reset link | agents | 1 |
| 5 | Database coverage the suites left out | agents | 1, Docker |
| 6 | Repository contract suite, run against both implementations; make the Supabase one pass it | agents | 4, Docker |
| 7 | Pilot kit: student sign-in page, runbook, dry-run checklist | agents | 2 |
| 8 | Final review and release-readiness report | agents (read-only) | 1–7 |
| 9 | Release: `dev` → `main`, migrations to prod, provisioning, dry run | Adrian + Parv | 8 |

Task 2 runs early on purpose: every agent reads `CLAUDE.md`, which still
describes the old V0. Agents left with the old scope would build session pages.

## 4. How the agents work

One task → one branch → one pull request into `dev`. Never `main`.

For each task, in order:

1. **Implement** — a fresh agent in its own git worktree cuts `feat/…` from
   `origin/dev`, works test-first from the plan, runs `npm run verify`, commits,
   pushes, opens a PR into `dev`.
2. **Review**, two independent agents reading the PR diff only:
   - *spec* — does it do what the plan's task says, no more;
   - *security & test integrity* — RLS, secrets, own-results-only, and whether
     any test was weakened, skipped or deleted to go green.
3. **Fix** — if either reviewer blocks, a fresh agent fixes on the same branch.
   At most two rounds; then the task stops and is reported, never forced.
4. **Verify** — a fresh agent checks the branch out and runs every layer:
   lint, types, unit, end-to-end, secret scan, pgTAP, integration. The database
   layers run one task at a time (one local Supabase stack is shared).
5. **Merge** — only when both reviewers approve, verification is green and the
   PR's CI checks are green: `gh pr merge --merge` into `dev`.

The work runs in **waves** so a person can read each result before the next:

| Wave | Tasks | Agents (no fix rounds → two fix rounds) |
|---|---|---|
| 1 | 1, then 2 and 3 in parallel | 14 → ~24 |
| 2 | 4 and 5 in parallel | 11 → ~21 |
| 3 | 6 | 6 → ~12 |
| 4 | 7, then 8 | 11 + one skeptic per finding |

Counted by simulating the workflow with stub agents. Each wave is above the
usual ten-agent guideline; that is the price of two independent reviewers and
a separate verifier per task, which is what keeps the guardrails real.

The saved workflow `.claude/workflows/pulse-v0-finish.js` runs one wave per
launch (`args: { wave: 1 }` …), and its preflight refuses to start a wave whose
prerequisites are not met.

## 5. Practices that must survive (all tasks)

These are the existing rules, made explicit so that agents keep them:

- **Branches.** Feature branches from `dev`, PR into `dev`. Nothing is pushed or
  merged to `main` by an agent. No force-push. No branch deletion. No change to
  GitHub, Vercel or Supabase settings.
- **Secrets.** Only the anon key is used, in `.env.local` (git-ignored) and Vercel.
  The `service_role` key is never used, read, printed or committed. Agents check
  that `.env.local` contains a key by counting matches, never by printing it.
  Task 3 makes a tracked secret fail CI.
- **Database.** Every change to schema or RLS is a **new** migration plus a pgTAP
  test in the same PR. Migrations already pushed to a project (`20261003000000_*`,
  `20261004120000_*`) are never edited. Agents run migrations only against the
  local stack — never `db push`, never against dev or prod.
- **Own results only** is proven by pgTAP and nowhere else. The in-memory repo
  imitates it; it is never the guarantee.
- **Tests.** Four layers stay green (five after Task 6). A failing test is fixed
  by fixing the code. A test is changed only if it is itself wrong, and the PR
  says why. No `.skip`, no `.only`, no lowered assertion counts.
- **Data.** Demo data is fictional (`.example` addresses). Real student names and
  emails never enter the repository; provisioning SQL is run by a person.
- **Product.** English interface strings in `src/i18n/en.ts`; the design system's
  classes for anything that moves; mobile-first on the student side; a refusal is
  shown, never swallowed; no score, ranking or aggregate shown to students.

## 6. Open decisions (not for agents)

- **Email confirmation in class.** With confirmation on — required, or a student
  can claim a classmate's seat — the first visit means opening the school mailbox
  on the phone. Either students claim their account *before* the class (a message
  a few days ahead), or the class absorbs that step. Adrian and Parv decide; the
  runbook (Task 7) covers both.
- **A new test version** (v2) after students took v1: does it reopen the test for
  them? Undecided; no task encodes either answer.
- The pilot module, the real test, the privacy notice and retention policy (Parv).

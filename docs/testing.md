# How Pulse is tested

Five layers, each proving something the others cannot. All of them run on every
pull request; none of them needs a Supabase project or a secret.

| Layer | Where | Proves | Command |
|---|---|---|---|
| **Data rules** | `supabase/tests/*.sql` (pgTAP) | Own-results-only, no self-enrollment, one attempt, frozen tests, the hardening fixes | `npm run db:test` |
| **Unit** | `src/data/*.test.ts` (Vitest) | The repository contract: what each call allows and refuses | `npm test` |
| **Integration** | `src/data/*.integration.test.ts` (Vitest, local Supabase) | The Supabase repository keeps the same contract as the in-memory one | `npm run test:integration` |
| **Component** | `src/features/**/*.test.tsx` (Vitest + Testing Library) | A screen's behaviour: what a person sees and can do | `npm test` |
| **End-to-end** | `e2e/*.spec.ts` (Playwright) | The journeys, in a real browser, on a laptop **and a phone** | `npm run test:e2e` |

`npm run test:all` runs the JavaScript layers in order.

`npm run verify` runs every local check except the browser and the database:
lint, types, unit and component tests, the secret scan, the build. It is what
"green" means before a pull request.

**The secret scan** (`npm run check:secrets`) fails when a tracked file holds a
`service_role` key, a Supabase secret key, a remote database password, or an env
file. It prints the file and line, never the value. CI runs it on every PR.

## What each layer is for

**The database tests are the ones that matter most.** Own-results-only is a
property of the schema, not a promise of the interface: a student must not be
able to read a classmate's answers even if every screen were rewritten
tomorrow. That is why 54 pgTAP assertions exist, and why a change to RLS needs
a test in the same pull request.

**The unit tests cover the repository**, the only place that talks to Supabase.
They run against the in-memory implementation, which imitates the database's
rules so that a screen written against it behaves the same against the real one.
The fake is a development double, never a security boundary.

**The integration layer keeps the two implementations honest.** The scenarios
in `src/data/contract/repoContract.ts` are written once and run twice: against
the in-memory repo in the unit layer, and against `createSupabaseRepo` on the
local stack (`npm run test:integration`, Docker needed; CI runs it in the
database job, right after pgTAP). A scenario that passes on one and fails on
the other is a bug in the implementation, never a reason to change the scenario.

**The component tests cover one screen at a time** — the refusal shown after a
hand-in, the question that can be revisited, the multiple choice that needs two
options.

**The end-to-end tests walk the journeys**: sign in, take the test, hand in;
write a test, publish it, read the answers. They run against the built app with
`VITE_DATA_SOURCE=fake`, so no project, no Docker, no secrets — which is what
makes them safe on every pull request. The student journey is checked at phone
size too, because that is where it will be used.

## Writing a test

- Name it after the behaviour, not the function: `refuses a late answer out
  loud rather than silently dropping it`.
- Use roles and labels (`getByRole`, `getByLabel`), not CSS classes. A test that
  breaks when a class name changes is noise; one that breaks when a button loses
  its name has found something.
- For a rule, write the test that would fail against the code as it was. Each
  fix in `20261004120000_v0_hardening.sql` has one.
- A refusal is a result: assert the message, not just the absence of a change.
  "Nothing happened" is exactly the failure mode the pilot cannot afford.

## Running Playwright locally

```bash
npx playwright install chromium   # once
npm run test:e2e                  # both projects, headless
npm run test:e2e:ui               # watch it click through, pick single tests
npx playwright test --project=phone
npx playwright show-report        # after a failure: trace, screenshot, video
```

The config builds the app and serves it on port 4173, so the tests run against
what students would actually load, not the dev server.

## What is not tested yet

- **The hosted projects.** The contract runs against the local stack, which has
  the same migrations; the dev and prod projects are checked by hand before a
  class (runbook).
- **Email confirmation**, a dashboard setting no test can assert.
- **Accessibility** beyond roles and labels, and visual regression.

# How Pulse is tested

Four layers, each proving something the others cannot. All of them run on every
pull request; none of them needs a Supabase project or a secret.

| Layer | Where | Proves | Command |
|---|---|---|---|
| **Data rules** | `supabase/tests/*.sql` (pgTAP) | Own-results-only, no self-enrollment, one attempt, frozen tests, the hardening fixes | `npm run db:test` |
| **Unit** | `src/data/*.test.ts` (Vitest) | The repository contract: what each call allows and refuses | `npm test` |
| **Component** | `src/features/**/*.test.tsx` (Vitest + Testing Library) | A screen's behaviour: what a person sees and can do | `npm test` |
| **End-to-end** | `e2e/*.spec.ts` (Playwright) | The journeys, in a real browser, on a laptop **and a phone** | `npm run test:e2e` |

`npm run test:all` runs the JavaScript layers in order.

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

- **The Supabase implementation against a real project.** The repository has two
  implementations; only the in-memory one is exercised by these tests. Until the
  EU projects exist, `createSupabaseRepo` is unproven code.
- **Email confirmation**, a dashboard setting no test can assert.
- **Accessibility** beyond roles and labels, and visual regression.

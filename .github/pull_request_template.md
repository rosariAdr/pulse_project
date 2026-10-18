## What and why

<!-- One paragraph: the behaviour that changes, and why. -->

## Checks

- [ ] `npm run verify` passes (lint, types, unit + component, secret scan, build)
- [ ] `npm run test:e2e` passes, laptop and phone
- [ ] Touches SQL? A **new** migration **and** a pgTAP test; `npm run db:reset && npm run db:test` passes
- [ ] No test skipped, deleted or loosened — or the reason is written below
- [ ] No secret, no real student name or email, no `service_role` anywhere
- [ ] Interface strings in `src/i18n/en.ts`; student screens checked at phone width
- [ ] Targets `dev` (never `main`, except the release PR)

## How it was verified

<!-- Commands run and what they showed. -->

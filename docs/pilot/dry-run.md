# Dry run — before the first real class

Goal: find out, before the students do, whether 25 phones on one wifi can sign
in, take the test and hand it in.

## Set-up (on the **dev** project, never prod)

- [ ] A fictional class of 25 profiles in a CSV (`dryrun01` … `dryrun25` — addresses you can receive mail at, e.g. `+tags` on one inbox: `<you>+dryrun01@<your-domain>`), provisioned on dev with `scripts/provision.mjs`. Keep that CSV out of the repository.
- [ ] The real entrance test, published on dev.
- [ ] As many real phones as you can gather, in the room where the class will be.

## The run

- [ ] Everyone does the first visit at the same time. Note: time to sign in for the slowest phone, emails that arrived late.
- [ ] Everyone takes the test. Midway, put one phone in airplane mode for a minute, then back: the answers must still be there.
- [ ] Everyone hands in within the same minute.
- [ ] Raw results show 25 hand-ins; the CSV opens in a spreadsheet with accents intact.

## Pass / fail

Pass when: every phone signed in within ten minutes, no answer was lost, 25 hand-ins arrived.
Anything else is a finding: write it in the Decision Log and fix it before the real class.

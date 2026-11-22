# Pilot-day runbook

## The day before

- [ ] Open the app once (wakes the Supabase project; it pauses after a week idle).
- [ ] GitHub → **Actions**, for *Nightly backup (prod)* and for *Keep Supabase awake* (scheduled runs use the workflow files on `main`):
  - no banner saying the scheduled workflow is disabled. GitHub disables schedules after 60 days without a commit: press **Enable workflow**;
  - the latest scheduled run is green and **less than 24 hours old**;
  - *Nightly backup (prod)* took **more than 10 seconds**;
  - in *Keep Supabase awake*, the job *ping (PROD)*, step **Ping PROD**, printed the time returned by `ping()`, not "No secret for PROD — skipping".
- [ ] Prod has every migration of the release. In an up-to-date checkout of `main`, run `npm ci` first, so `npx` uses the CLI version locked in `package-lock.json`, then:
  1. `npx supabase link --project-ref <prod-ref>`
  2. `npx supabase migration list`: every line needs the same number in **Local** and **Remote**.
     - A blank **Remote**: prod's schema is behind the code. Still linked to prod, run `npx supabase db push`, then list again.
     - A blank **Local**: prod has a migration that is not on `main`. Push nothing; sort it out before the class.
  3. `npx supabase link --project-ref <dev-ref>`, always, so a mistaken command hits dev, not prod.
- [ ] Sign in as the master account: the module's **Entrance test** page shows the test **Published**, with the right number of questions.
- [ ] Raw results for the module: the roster lists every student, nobody has answered.
- [ ] Email confirmation is ON in the prod project (Authentication → Email), and the custom SMTP (Brevo) sends: request a reset link for your own address and check it arrives.
- [ ] Prod → Authentication → **Rate Limits**: write down the limit on sign-ups and sign-ins per IP address, and the limit on emails sent, each with its time window. The whole class signs in from the school's one IP, and with confirmation ON every first visit sends an email.
- [ ] If students claim their accounts **before** the class (spec §6), send them `student-sign-in.md` now.
- [ ] Print 25 paper copies of the test — the fallback.

## In class

1. Project `student-sign-in.md`. Give the address out loud and on the board.
2. Allow ten minutes for sign-in before the test starts. Walk the room.
3. Start the test: 15 to 20 minutes. Raw results show hand-ins as they arrive — reload the page to see the latest (it does not refresh by itself).
4. Before anyone leaves: reload raw results → roster. Anyone **not handed in** hands in now, or on paper.

## When something goes wrong

Messages are quoted as the app shows them today. Several failures still share one message, so read the whole line before acting.

💡 [Claude-proposed — to validate] The lines on rate limits, unconfirmed emails and a cut hand-in, and the reading of the result in "Add a missing profile", were written on 19 Nov 2026 from the code, not from a rehearsal.

| What you see | What to do |
|---|---|
| One student: "This email has no Pulse profile" | Compare the address with the class list. A typo, or a student missing from the list: **add the missing profile** (below, 2 min). Don't re-run the class's provisioning SQL: it would add the class and the module a second time. |
| Several students at once, with the right addresses: "That email and password do not match." or "This email has no Pulse profile" | Too many sign-ins from one IP address: the whole room goes out through the school's, and Supabase caps sign-ins per IP (the limit noted the day before). Nobody retries, resets a password or runs SQL. Stop sign-ins until the time window has passed, then let the room in by halves. Phones on mobile data have their own IP and can go on. If first visits on mobile data fail too, the project has reached its limit on emails sent (confirmation ON): mobile data does not help, so wait out that window or switch to paper. |
| A student who created their password reads "That email and password do not match." | If email confirmation is ON, the account waits for the link in the confirmation email: open it, then sign in. Don't send a reset link. Prod → Authentication → Users shows whether the address is confirmed. Confirmed and still refused: wrong password, use "Forgot your password?". |
| No confirmation email | Spam folder; wait 2 minutes. Mail goes through Brevo (about 300 a day): check its dashboard for a block or a bounce. Beyond that, paper. |
| "Something went wrong" on many phones | Check https://www.vercel-status.com and https://status.supabase.com. Switch to paper; the test stays open. |
| Right after tapping Hand in, on a weak connection: "You cannot do that.", "Something went wrong. Try again." or "You have already handed this test in…" | The hand-in may not have arrived: a cut connection can show any of these. Reload raw results. Handed in: done. Not handed in: the student gets a connection back (wifi or mobile data) and reloads the test page, which shows the answers Pulse has saved; they rewrite any missing one and hand in again. |
| One phone dies | Sign in on another device: the test reopens with the answers Pulse has saved. Check them, rewrite any missing one, continue. |
| The room's wifi fails | Students use mobile data; if not possible, paper. |
| A student handed in by mistake | It cannot be reopened. Note it; their answers so far are kept. |

### Add a missing profile

Prod project → **SQL editor**, one statement. Copy the institution and the class from the CSV, exactly as written there, with the address the student really uses:

```sql
insert into public.student_profiles (class_id, full_name, email)
select id, 'Camille Roux', 'c.roux@school.example' from public.classes
where institution = 'IDRAC Toulouse' and name = 'B1 · Groupe 2'
returning full_name, email;
```

- **One row** comes back: the student does the first visit again, with that address.
- **No row**: the institution or the class is not written as in prod. Check it in Table editor → `classes`, then run it again.
- **Two rows or more**: the class exists twice in prod. The student can sign in; sort out the duplicate after class.
- The misspelled profile stays in the roster, never signed in, and counts in "X of Y handed in". Leave it until after class.

## After class

- [ ] Raw results → **Export CSV**; keep it with the paper copies.
- [ ] A profile added in class: correct the class CSV too, so it stays the record (never re-run it). Delete the misspelled profile, which nobody claimed: `delete from public.student_profiles where email = '<misspelled address>' and user_id is null;`
- [ ] Note what went wrong, in the Decision Log, the same day.
- [ ] Paper answers: type them in later, or keep them aside — never mix them into the CSV unmarked.

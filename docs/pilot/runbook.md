# Pilot-day runbook

## The day before

- [ ] Open the app once (wakes the Supabase project; it pauses after a week idle).
- [ ] Check GitHub Actions: last *Nightly backup (prod)* is green **and took more than 10 seconds**.
- [ ] Sign in as the master account: the module's **Entrance test** page shows the test **Published**, with the right number of questions.
- [ ] Raw results for the module: the roster lists every student, nobody has answered.
- [ ] Email confirmation is ON in the prod project (Authentication → Email), and the custom SMTP (Brevo) sends: request a reset link for your own address and check it arrives.
- [ ] If students claim their accounts **before** the class (spec §6), send them `student-sign-in.md` now.
- [ ] Print 25 paper copies of the test — the fallback.

## In class

1. Project `student-sign-in.md`. Give the address out loud and on the board.
2. Allow ten minutes for sign-in before the test starts. Walk the room.
3. Start the test: 15 to 20 minutes. Raw results show hand-ins as they arrive — reload the page to see the latest (it does not refresh by itself).
4. Before anyone leaves: reload raw results → roster. Anyone **not handed in** hands in now, or on paper.

## When something goes wrong

| What you see | What to do |
|---|---|
| "This email has no Pulse profile" | Compare the address with the class list. A typo in the list: fix the CSV, regenerate the SQL, run it (2 min). |
| No confirmation email | Spam folder; wait 2 minutes. Mail goes through Brevo (about 300 a day): check its dashboard for a block or a bounce. Beyond that, paper. |
| "Something went wrong" on many phones | Check https://www.vercel-status.com and https://status.supabase.com. Switch to paper; the test stays open. |
| One phone dies | Answers are saved as written: sign in on another device, continue. |
| The room's wifi fails | Students use mobile data; if not possible, paper. |
| A student handed in by mistake | It cannot be reopened. Note it; their answers so far are kept. |

## After class

- [ ] Raw results → **Export CSV**; keep it with the paper copies.
- [ ] Note what went wrong, in the Decision Log, the same day.
- [ ] Paper answers: type them in later, or keep them aside — never mix them into the CSV unmarked.

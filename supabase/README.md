# supabase/

1. `supabase init` in the repo root (creates `config.toml`; keep these folders).
2. `supabase start` → `supabase db reset` applies `migrations/` then `seed.sql` (fictional demo class).
3. `supabase test db` runs `tests/rls.test.sql` (pgTAP, 36 assertions — all green on PostgreSQL 16 with a Supabase-like auth stub, 3 Oct 2026). CI runs it on every pull request.
4. Link the dev project (EU region) and `supabase db push`. Production gets migrations only — **never** `seed.sql`.

To sign in locally as the master account: sign up in the app with `master@pulse.example`. Students: any email in `seed.sql` (e.g. `l.fontaine@idrac.example`). Any other email is refused by design (`PULSE_NO_PROFILE`).

Storage: create a private bucket `session-materials`; policies for it are not in this migration yet (next step — master writes, students read files of prepared sessions in their modules).

## Free plan (decided 3 Oct 2026)

Two projects only: **dev** and **prod**, both in an EU region.

- **Pausing**: a project pauses after 1 week without activity. `.github/workflows/keep-alive.yml` calls `rpc/ping` on both every day (`public.ping()` returns the time and reads no data). Also open the app yourself the day before each class.
- **Backups**: the Free plan has none. `.github/workflows/backup.yml` dumps prod every night (roles, schema, data), encrypts it with GPG and keeps it 30 days as a workflow artifact. Rehearse one restore on the dev project before the pilot (the restore command is at the top of the workflow).
- **Limits**: 500 MB database, 1 GB storage, 5 GB egress, 50,000 monthly active users. Far above a pilot, but keep materials light.

GitHub secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SUPABASE_URL_DEV`, `SUPABASE_URL_PROD` | Project URL |
| `SUPABASE_ANON_KEY_DEV`, `SUPABASE_ANON_KEY_PROD` | anon / publishable key |
| `SUPABASE_DB_URL_PROD` | Session pooler connection string with the password |
| `BACKUP_PASSPHRASE` | Long passphrase, kept offline by both founders |

The workflows skip quietly while a secret is missing.

## Late exercise answers

`answers.late` is set by the `answers_exercise_guard` trigger. The deadline is the start of the next session's `scheduled_on` day (Europe/Paris). Late answers are accepted and stay editable. On-time answers freeze once the deadline passes (`PULSE_REPORT_FROZEN`). The master account can still correct. `raw_results` exposes `late`.

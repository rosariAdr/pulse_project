# Provisioning a real class (V0)

V0 has no master screens — the founders provision by hand. One spreadsheet, one
script, one SQL file you read before running.

## 1. Fill in the spreadsheet

Copy `scripts/classes.example.csv`. One line per student; the class, institution
and module repeat on each line of that class.

| Column | Required | Notes |
|---|---|---|
| `institution` | yes | e.g. `IDRAC Toulouse` |
| `class` | yes | e.g. `B1 · Groupe 2` |
| `level` | no | e.g. `B1` |
| `student_name` | yes | as the student should see it |
| `student_email` | yes | **the exact address the student will sign up with** |
| `module_code` | yes | short code, e.g. `ST` |
| `module_title` | yes | e.g. `Statistiques commerciales` |
| `module_language` | no | `fr` or `en`, default `en` |
| `session_count` | no | how many sessions the module has |

The email matters more than anything else here: sign-up is refused for any
address that is not in this list (`PULSE_NO_PROFILE`). A typo means a student
standing in class unable to get in.

**The filled-in file holds personal data. Keep it out of the repository.**

## 2. Generate the SQL

```bash
node scripts/provision.mjs my-classes.csv > provision.sql
```

It validates first and writes nothing if anything is wrong: a malformed address,
a missing column, the same student twice in one class.

**The first time on a project** (an empty prod), add each founder's master
account with `--staff`, once per founder:
`node scripts/provision.mjs --staff "Full Name <email>" --staff "Full Name <email>" my-classes.csv > provision.sql`.
Sign-up is refused for any address without a staff or student row, so without
it nobody can sign in as the master account. Type the real addresses on the
command line only, never in a file in the repository. A founder who already has
an account is skipped (`on conflict do nothing`), and the SQL refuses to run
while the project has no master account (`PULSE_NO_MASTER`).

## 3. Read it, then run it

Open `provision.sql`, check the class and student names, then paste it into the
Supabase SQL editor of **one** project — dev to rehearse, prod for the real
class. It runs in a transaction: all of it, or none of it.

The script never connects to anything itself. Nothing is provisioned until a
person runs that SQL.

### Running it again

The SQL is safe to run again on the same project. That is how a mistake is
fixed on the day: correct the CSV, regenerate the SQL, read it, run it.

- A class is found by its **institution and name**, a module by its **code**,
  exactly as typed: same case, same spelling (spaces at either end of a cell
  are dropped). Only a class or a module that does not exist yet is created.
- A student profile is added only if its address is not in that class yet; a
  founder, only if the address has no staff account; a module is attached to a
  class only once.
- Nothing that already exists is changed or deleted. A corrected address adds a
  new profile and leaves the misspelt one unclaimed. A new module title,
  language or session count, or a new class level, is not applied to an existing
  row.
- Spell the institution, the class and the module code exactly as in the first
  run: `IDRAC toulouse` instead of `IDRAC Toulouse` creates a second class.
- A module code is shared by every class and institution. On dev, the seeded
  demo already has the modules `ST` and `DM`: a rehearsal CSV that uses those
  codes is attached to the demo module, which it shares with the demo class
  (and, for `ST`, with the demo test already drafted there). To rehearse
  writing and publishing the test from scratch, use another code.

`💡 [Claude-proposed — to validate]` If an earlier run already created the same
class or module twice, the SQL stops with `PULSE_DUPLICATE_CLASS` or
`PULSE_DUPLICATE_MODULE` and provisions nothing, rather than guess which copy is
the real one. To see the copies of a class, or of a module:

```sql
select c.id, c.created_at, count(p.id) as profiles, count(p.user_id) as claimed
from public.classes c
left join public.student_profiles p on p.class_id = c.id
where c.institution = 'IDRAC Toulouse' and c.name = 'B1 · Groupe 2'
group by c.id
order by c.created_at;

select m.id, m.created_at, m.title, count(t.id) as tests
from public.modules m
left join public.tests t on t.module_id = m.id
where m.code = 'ST'
group by m.id
order by m.created_at;
```

The real copy is usually the one students have claimed, attached to the module
that holds the published test. `💡 [Claude-proposed — to validate]` To let the
script run again without deleting anything, rename the other copy (for a class,
`update public.classes set name = name || ' (duplicate)' where id = '…';`; for
a module, the same on `code`), then run the SQL again. Deleting a copy is
refused as soon as a student has started a test in it (the attempts keep it).

## 4. Then, in the app

Sign in as the master account, open the module, write the entrance test and
publish it. Students create their account with the address you listed, choose a
password, and the module is waiting for them.

Before a real class, check that **email confirmation is ON** in Supabase Auth
for that project — without it, anyone who knows a classmate's address could
claim their seat.

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

## 3. Read it, then run it

Open `provision.sql`, check the class and student names, then paste it into the
Supabase SQL editor of **one** project — dev to rehearse, prod for the real
class. It runs in a transaction: all of it, or none of it.

The script never connects to anything itself. Nothing is provisioned until a
person runs that SQL.

## 4. Then, in the app

Sign in as the master account, open the module, write the entrance test and
publish it. Students create their account with the address you listed, choose a
password, and the module is waiting for them.

Before a real class, check that **email confirmation is ON** in Supabase Auth
for that project — without it, anyone who knows a classmate's address could
claim their seat.

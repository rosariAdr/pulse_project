-- =============================================================================
-- Pulse — V0 data model (framework v10, 30 Aug 2026)
-- -----------------------------------------------------------------------------
-- classes → student_profiles → (class ↔ module) → modules → sessions →
-- exercises → answers, plus the entrance test (tests → test_questions → attempts).
--
-- Rules enforced HERE, in the database — not promised by the interface:
--   1. No self-enrollment: an auth account can only be created when its email
--      matches a pre-created student profile or master account (trigger on
--      auth.users). Sign-up for anyone else fails.
--   2. Own results only: a student reads and writes only rows tied to their own
--      profile(s) (RLS).
--   3. One attempt per student per test (unique constraint), answers editable
--      only while the attempt is open (autosave + resume), frozen once handed in.
--   4. A published test is frozen: its questions can't be edited or deleted —
--      publish a new version instead.
--   5. Answer keys and advice live in separate tables students can't read.
--   7. Late exercise answers (after the next session opens) are accepted and
--      flagged `late` — they count in the student's private progress (decision
--      3 Oct 2026). An answer given on time is the teacher's report line and is
--      frozen once the next session opens.
--   6. One role in V0: the master account (the founders) — reads and writes
--      everything. Separate teacher accounts are V1.
--
-- Not in V0, deliberately: module-link joining, welcome emails, AI anything,
-- the publish check, feedback sum-up, participation grade.
-- =============================================================================

create extension if not exists citext;

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------

-- Master accounts (V0: the founders). Pre-created by email; the auth account
-- attaches on first sign-in. V1 adds role 'teacher'.
create table public.staff_accounts (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null unique,
  display_name text   not null,
  role         text   not null default 'master' check (role in ('master')),
  user_id      uuid   unique references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                       -- e.g. 'B1 · Groupe 2'
  institution text not null,                       -- e.g. 'IDRAC Toulouse'
  level       text,
  created_by  uuid references public.staff_accounts (id),
  created_at  timestamptz not null default now()
);

-- A student's place in one class, created by the master account BEFORE any
-- account exists. Claimed at first sign-in when the email matches.
create table public.student_profiles (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid   not null references public.classes (id) on delete cascade,
  full_name   text   not null,
  email       citext not null,
  user_id     uuid   references auth.users (id) on delete set null,
  claimed_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (class_id, email)
);
create index student_profiles_user_idx on public.student_profiles (user_id);
create index student_profiles_email_idx on public.student_profiles (email);

-- -----------------------------------------------------------------------------
-- Content (authored once, reused across classes — never carries class/school ids)
-- -----------------------------------------------------------------------------

create table public.modules (
  id            uuid primary key default gen_random_uuid(),
  code          text,                              -- e.g. 'ST'
  title         text not null,                     -- e.g. 'Statistiques commerciales'
  level         text,                              -- e.g. 'B1'
  language      text not null default 'en' check (language in ('en', 'fr')),
  session_count int  not null default 0 check (session_count between 0 and 60),
  created_by    uuid references public.staff_accounts (id),
  created_at    timestamptz not null default now()
);

-- Attaching a class to a module is what makes the module appear for its students.
create table public.class_modules (
  class_id   uuid not null references public.classes (id) on delete cascade,
  module_id  uuid not null references public.modules (id) on delete cascade,
  attached_at timestamptz not null default now(),
  primary key (class_id, module_id)
);
create index class_modules_module_idx on public.class_modules (module_id);

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid not null references public.modules (id) on delete cascade,
  n            int  not null check (n >= 1),
  title        text not null default '',
  summary      text,
  scheduled_on date,
  status       text not null default 'empty' check (status in ('empty', 'draft', 'prepared')),
  unique (module_id, n)
);

-- Content the teacher drops on a session (slides, PDFs, articles, datasets).
-- Files live in Supabase Storage (bucket 'session-materials'); `storage_path` points there.
create table public.session_materials (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions (id) on delete cascade,
  position     int  not null default 1,
  kind         text not null check (kind in ('slides', 'pdf', 'article', 'dataset', 'notes', 'link')),
  title        text not null,
  storage_path text,
  url          text,
  created_at   timestamptz not null default now(),
  check (storage_path is not null or url is not null)
);

create table public.exercises (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  position    int  not null default 1,
  kind        text not null check (kind in ('mcq', 'short', 'judgment')),
  prompt      text not null,
  options     jsonb,                               -- mcq only: ["A", "B", …]
  skill       text,                                -- taxonomy tag
  max_attempts int not null default 1 check (max_attempts >= 1),
  check ((kind = 'mcq') = (options is not null))
);

-- Answers are optional (can be corrected in class instead); never readable by students in V0.
create table public.exercise_keys (
  exercise_id    uuid primary key references public.exercises (id) on delete cascade,
  correct_answer text,
  advice         text
);

-- -----------------------------------------------------------------------------
-- The entrance test (one per module, versioned)
-- -----------------------------------------------------------------------------

create table public.tests (
  id                 uuid primary key default gen_random_uuid(),
  module_id          uuid not null references public.modules (id) on delete cascade,
  version            int  not null default 1,
  status             text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  time_limit_minutes int  not null default 20 check (time_limit_minutes between 5 and 120),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (module_id, version)
);
-- At most one published test per module at a time.
create unique index tests_one_published_per_module on public.tests (module_id) where status = 'published';

create table public.test_questions (
  id       uuid primary key default gen_random_uuid(),
  test_id  uuid not null references public.tests (id) on delete cascade,
  position int  not null,
  kind     text not null check (kind in ('mcq', 'short', 'judgment')),
  prompt   text not null,
  options  jsonb,
  skill    text,
  unique (test_id, position),
  check ((kind = 'mcq') = (options is not null))
);

create table public.test_question_keys (
  question_id    uuid primary key references public.test_questions (id) on delete cascade,
  correct_answer text,
  advice         text
);

-- -----------------------------------------------------------------------------
-- Attempts and answers
-- -----------------------------------------------------------------------------

create table public.attempts (
  id                 uuid primary key default gen_random_uuid(),
  test_id            uuid not null references public.tests (id) on delete cascade,
  student_profile_id uuid not null references public.student_profiles (id) on delete cascade,
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  unique (test_id, student_profile_id)                -- one attempt per student per test
);

-- One table for both entrance-test answers and exercise answers; both feed raw results.
create table public.answers (
  id                 uuid primary key default gen_random_uuid(),
  student_profile_id uuid not null references public.student_profiles (id) on delete cascade,
  attempt_id         uuid references public.attempts (id) on delete cascade,
  question_id        uuid references public.test_questions (id) on delete cascade,
  exercise_id        uuid references public.exercises (id) on delete cascade,
  response           text not null default '',
  attempt_no         int  not null default 1,
  late               boolean not null default false,  -- exercise answered after the next session opened (set by trigger)
  updated_at         timestamptz not null default now(),
  -- exactly one target: a test question (inside an attempt) or an exercise
  check (
    (question_id is not null and attempt_id is not null and exercise_id is null)
    or (exercise_id is not null and question_id is null and attempt_id is null)
  )
);
create unique index answers_one_per_question on public.answers (attempt_id, question_id) where question_id is not null;
create unique index answers_one_per_exercise_attempt on public.answers (student_profile_id, exercise_id, attempt_no) where exercise_id is not null;
create index answers_profile_idx on public.answers (student_profile_id);

-- =============================================================================
-- Helper functions (SECURITY DEFINER so policies can look across tables without
-- recursion; each is narrow and returns only facts about the caller)
-- =============================================================================

create or replace function public.is_master()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from staff_accounts where user_id = auth.uid() and role = 'master');
$$;

-- The caller's own student profile ids (one per class they belong to).
create or replace function public.my_profile_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select id from student_profiles where user_id = auth.uid();
$$;

-- Modules attached to a class the caller is a student of.
create or replace function public.my_module_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select cm.module_id
  from class_modules cm
  join student_profiles sp on sp.class_id = cm.class_id
  where sp.user_id = auth.uid();
$$;

-- Is this attempt the caller's own, still open (not handed in, within time + 2 min grace)?
create or replace function public.attempt_is_mine_and_open(p_attempt uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from attempts a
    join tests t on t.id = a.test_id
    where a.id = p_attempt
      and a.student_profile_id in (select id from student_profiles where user_id = auth.uid())
      and a.submitted_at is null
      and t.status = 'published'
      and now() <= a.started_at + make_interval(mins => t.time_limit_minutes + 2)
  );
$$;

revoke all on function public.is_master(), public.my_profile_ids(), public.my_module_ids(), public.attempt_is_mine_and_open(uuid) from public;
grant execute on function public.is_master(), public.my_profile_ids(), public.my_module_ids(), public.attempt_is_mine_and_open(uuid) to authenticated;

-- =============================================================================
-- Rule 1 — no self-enrollment: sign-up only from a pre-created profile
-- =============================================================================

create or replace function public.claim_profile_on_signup()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_matched int := 0;
begin
  update staff_accounts
     set user_id = new.id
   where email = new.email::citext and user_id is null;
  get diagnostics v_matched = row_count;

  update student_profiles
     set user_id = new.id, claimed_at = now()
   where email = new.email::citext and user_id is null;
  v_matched := v_matched + (select count(*) from student_profiles where user_id = new.id);

  if v_matched = 0 then
    raise exception 'PULSE_NO_PROFILE: no Pulse profile exists for this email'
      using errcode = 'P0001',
            hint = 'Your school creates your profile. Check the email you were given, or ask your teacher.';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.claim_profile_on_signup();

-- =============================================================================
-- Rule 3 — attempts: students may only set submitted_at, once
-- Rule 4 — published tests are frozen
-- =============================================================================

create or replace function public.guard_attempt_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_master() then
    return new;
  end if;
  if old.submitted_at is not null then
    raise exception 'PULSE_ATTEMPT_CLOSED: this test has already been handed in' using errcode = 'P0001';
  end if;
  if new.test_id <> old.test_id or new.student_profile_id <> old.student_profile_id or new.started_at <> old.started_at then
    raise exception 'PULSE_ATTEMPT_IMMUTABLE: only the hand-in time can change' using errcode = 'P0001';
  end if;
  if new.submitted_at is not null then
    new.submitted_at := now();          -- the server's clock, not the phone's
  end if;
  return new;
end;
$$;

create trigger attempts_guard before update on public.attempts
  for each row execute function public.guard_attempt_update();

create or replace function public.guard_published_test_questions()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.tests where id = coalesce(new.test_id, old.test_id);
  if v_status <> 'draft' then
    raise exception 'PULSE_TEST_FROZEN: a published test cannot be edited — create a new version'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger test_questions_frozen before insert or update or delete on public.test_questions
  for each row execute function public.guard_published_test_questions();

create or replace function public.stamp_test_publish()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and old.status = 'draft' then
    new.published_at := now();
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'PULSE_TEST_FROZEN: a published test cannot return to draft — create a new version'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tests_publish before update on public.tests
  for each row execute function public.stamp_test_publish();

create or replace function public.touch_answer()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger answers_touch before update on public.answers
  for each row execute function public.touch_answer();

-- =============================================================================
-- Rule 7 — late exercise answers
-- The deadline of an exercise = the start (Europe/Paris) of the next session's
-- scheduled day. No next session or no date → no deadline.
-- =============================================================================

create or replace function public.exercise_deadline(p_exercise uuid)
returns timestamptz
language sql stable security definer set search_path = public
as $$
  select (nxt.scheduled_on::timestamp at time zone 'Europe/Paris')
  from exercises e
  join sessions s   on s.id = e.session_id
  join sessions nxt on nxt.module_id = s.module_id and nxt.n = s.n + 1
  where e.id = p_exercise;
$$;
grant execute on function public.exercise_deadline(uuid) to authenticated;

create or replace function public.guard_exercise_answer()
returns trigger
language plpgsql
as $$
declare
  v_deadline timestamptz;
begin
  if new.exercise_id is null then
    return new;
  end if;
  v_deadline := public.exercise_deadline(new.exercise_id);
  if tg_op = 'INSERT' then
    new.late := v_deadline is not null and now() >= v_deadline;
    return new;
  end if;
  -- UPDATE: an on-time answer is the report line; it freezes when the next session opens.
  if not public.is_master() then
    if old.late = false and v_deadline is not null and now() >= v_deadline then
      raise exception 'PULSE_REPORT_FROZEN: the next session has opened — this answer is now part of the report'
        using errcode = 'P0001';
    end if;
    new.late := old.late;               -- students can't flip the flag
  end if;
  return new;
end;
$$;

create trigger answers_exercise_guard before insert or update on public.answers
  for each row execute function public.guard_exercise_answer();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.staff_accounts     enable row level security;
alter table public.classes            enable row level security;
alter table public.student_profiles   enable row level security;
alter table public.modules            enable row level security;
alter table public.class_modules      enable row level security;
alter table public.sessions           enable row level security;
alter table public.session_materials  enable row level security;
alter table public.exercises          enable row level security;
alter table public.exercise_keys      enable row level security;
alter table public.tests              enable row level security;
alter table public.test_questions     enable row level security;
alter table public.test_question_keys enable row level security;
alter table public.attempts           enable row level security;
alter table public.answers            enable row level security;

-- Master account: everything, on every table (V0 has one role).
create policy master_all on public.staff_accounts     for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.classes            for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.student_profiles   for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.modules            for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.class_modules      for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.sessions           for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.session_materials  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.exercises          for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.exercise_keys      for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.tests              for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.test_questions     for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.test_question_keys for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.attempts           for all to authenticated using (public.is_master()) with check (public.is_master());
create policy master_all on public.answers            for all to authenticated using (public.is_master()) with check (public.is_master());

-- Staff can see their own account row (to know they are a master).
create policy staff_self on public.staff_accounts for select to authenticated using (user_id = auth.uid());

-- Students: their own profile(s), their own class(es).
create policy student_own_profile on public.student_profiles for select to authenticated
  using (user_id = auth.uid());
create policy student_own_class on public.classes for select to authenticated
  using (id in (select class_id from public.student_profiles where user_id = auth.uid()));

-- Students: content of modules attached to their class — prepared sessions only.
create policy student_modules on public.modules for select to authenticated
  using (id in (select public.my_module_ids()));
create policy student_class_modules on public.class_modules for select to authenticated
  using (module_id in (select public.my_module_ids())
         and class_id in (select class_id from public.student_profiles where user_id = auth.uid()));
create policy student_sessions on public.sessions for select to authenticated
  using (status = 'prepared' and module_id in (select public.my_module_ids()));
create policy student_materials on public.session_materials for select to authenticated
  using (session_id in (select id from public.sessions where status = 'prepared' and module_id in (select public.my_module_ids())));
create policy student_exercises on public.exercises for select to authenticated
  using (session_id in (select id from public.sessions where status = 'prepared' and module_id in (select public.my_module_ids())));
-- exercise_keys / test_question_keys: no student policy at all → invisible to students.

-- Students: published tests of their modules, and those tests' questions.
create policy student_tests on public.tests for select to authenticated
  using (status in ('published', 'closed') and module_id in (select public.my_module_ids()));
create policy student_test_questions on public.test_questions for select to authenticated
  using (test_id in (select id from public.tests where status = 'published' and module_id in (select public.my_module_ids())));

-- Students: their own attempts — start one on a published test of their module, hand it in once.
create policy student_attempts_read on public.attempts for select to authenticated
  using (student_profile_id in (select public.my_profile_ids()));
create policy student_attempts_start on public.attempts for insert to authenticated
  with check (
    student_profile_id in (select public.my_profile_ids())
    and submitted_at is null
    and test_id in (
      select t.id from public.tests t
      join public.class_modules cm on cm.module_id = t.module_id
      join public.student_profiles sp on sp.class_id = cm.class_id
      where t.status = 'published' and sp.id = student_profile_id
    )
  );
create policy student_attempts_hand_in on public.attempts for update to authenticated
  using (student_profile_id in (select public.my_profile_ids()) and submitted_at is null)
  with check (student_profile_id in (select public.my_profile_ids()));

-- Students: their own answers. Test answers only inside their own open attempt;
-- exercise answers only on exercises of prepared sessions in their modules.
create policy student_answers_read on public.answers for select to authenticated
  using (student_profile_id in (select public.my_profile_ids()));
create policy student_answers_write on public.answers for insert to authenticated
  with check (
    student_profile_id in (select public.my_profile_ids())
    and (
      (question_id is not null and public.attempt_is_mine_and_open(attempt_id)
        and question_id in (select q.id from public.test_questions q join public.attempts a on a.test_id = q.test_id where a.id = attempt_id))
      or
      (exercise_id is not null and exercise_id in (
        select e.id from public.exercises e join public.sessions s on s.id = e.session_id
        where s.status = 'prepared' and s.module_id in (select public.my_module_ids())))
    )
  );
create policy student_answers_update on public.answers for update to authenticated
  using (
    student_profile_id in (select public.my_profile_ids())
    and (question_id is null or public.attempt_is_mine_and_open(attempt_id))
  )
  with check (
    student_profile_id in (select public.my_profile_ids())
    and (question_id is null or public.attempt_is_mine_and_open(attempt_id))
  );

-- =============================================================================
-- Raw results (master account): each student's answers, as handed in.
-- security_invoker → the caller's RLS applies (a student calling it sees only themself).
-- =============================================================================

create view public.raw_results
with (security_invoker = true) as
select
  c.id            as class_id,
  c.name          as class_name,
  sp.id           as student_profile_id,
  sp.full_name    as student_name,
  m.id            as module_id,
  m.title         as module_title,
  case when ans.question_id is not null then 'entrance_test' else 'exercise' end as source,
  coalesce(tq.position, e.position) as item_position,
  coalesce(tq.prompt, e.prompt)     as prompt,
  s.n             as session_n,
  ans.response,
  ans.late,
  ans.updated_at,
  a.submitted_at  as test_handed_in_at
from public.answers ans
join public.student_profiles sp on sp.id = ans.student_profile_id
join public.classes c on c.id = sp.class_id
left join public.attempts a        on a.id = ans.attempt_id
left join public.test_questions tq on tq.id = ans.question_id
left join public.tests t           on t.id = tq.test_id
left join public.exercises e       on e.id = ans.exercise_id
left join public.sessions s        on s.id = e.session_id
join public.modules m on m.id = coalesce(t.module_id, s.module_id);

-- =============================================================================
-- Keep-alive for the Supabase free plan (projects pause after 1 week without
-- activity). A scheduled GitHub Action calls POST /rest/v1/rpc/ping daily.
-- It reads nothing: anon can call it and nothing else.
-- =============================================================================

create or replace function public.ping()
returns timestamptz
language sql stable
as $$ select now() $$;

-- =============================================================================
-- Grants (Supabase grants these by default; explicit for clarity and local tests)
-- =============================================================================

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.raw_results to authenticated;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

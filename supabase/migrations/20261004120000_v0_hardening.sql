-- =============================================================================
-- Pulse — V0 hardening (4 Oct 2026)
--
-- Five defects found reviewing the v10 schema, in the order they would bite a
-- real class:
--   1. attempts.started_at was client-writable, so the time limit could not be
--      enforced: a phone could claim to have started in ten years' time.
--   2. A student could insert one legal answer and then retarget it at another
--      exercise, or at a question of another test, landing it in the teacher's
--      list under the wrong module.
--   3. There was no autosave path: the uniqueness guarantees on `answers` are
--      partial indexes, which PostgREST's upsert cannot use as a conflict
--      target, and every refusal came back as a silent success with no rows.
--   4. Deleting a class, module, test or session cascaded all the way to the
--      answers — the one artefact the pilot exists to produce — on a plan with
--      no automatic backups. Deleting a published test also slipped past the
--      question freeze.
--   5. New tables created by later migrations would be readable by `anon`
--      again, because the revoke in the first migration was a one-off.
--
-- Also: the indexes the teacher's and student's hot reads were missing.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The server owns started_at
-- -----------------------------------------------------------------------------
create or replace function public.guard_attempt_insert()
returns trigger
language plpgsql
as $$
begin
  -- The clock that matters is the server's, never the phone's. The master
  -- account is not exempt: nothing legitimate needs to backdate an attempt.
  new.started_at := now();
  new.submitted_at := null;
  return new;
end;
$$;

drop trigger if exists attempts_insert_guard on public.attempts;
create trigger attempts_insert_guard
  before insert on public.attempts
  for each row execute function public.guard_attempt_insert();

-- -----------------------------------------------------------------------------
-- 2. An answer cannot change what it answers
-- -----------------------------------------------------------------------------
create or replace function public.guard_answer_target()
returns trigger
language plpgsql
as $$
begin
  if public.is_master() then
    return new;
  end if;

  if new.student_profile_id is distinct from old.student_profile_id
     or new.attempt_id is distinct from old.attempt_id
     or new.question_id is distinct from old.question_id
     or new.exercise_id is distinct from old.exercise_id then
    raise exception 'PULSE_ANSWER_RETARGET: an answer cannot be moved to another question or exercise'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Fires before answers_exercise_guard and answers_touch (alphabetical order).
drop trigger if exists answers_aa_target_guard on public.answers;
create trigger answers_aa_target_guard
  before update on public.answers
  for each row execute function public.guard_answer_target();

-- -----------------------------------------------------------------------------
-- 3. One call to save an answer, and a refusal that says so
-- -----------------------------------------------------------------------------
create or replace function public.save_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_response text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_test_id uuid;
  v_submitted timestamptz;
  v_started timestamptz;
  v_limit int;
  v_status text;
  v_now timestamptz := now();
begin
  if p_response is null then
    raise exception 'PULSE_BAD_REQUEST: response must not be null' using errcode = 'P0001';
  end if;

  -- Length is capped here rather than by a CHECK, so the message can be read.
  if length(p_response) > 5000 then
    raise exception 'PULSE_ANSWER_TOO_LONG: an answer is limited to 5000 characters'
      using errcode = 'P0001';
  end if;

  select a.student_profile_id, a.test_id, a.submitted_at, a.started_at, t.time_limit_minutes, t.status
    into v_profile_id, v_test_id, v_submitted, v_started, v_limit, v_status
    from public.attempts a
    join public.tests t on t.id = a.test_id
   where a.id = p_attempt_id;

  if v_profile_id is null then
    raise exception 'PULSE_NOT_FOUND: no such attempt' using errcode = 'P0001';
  end if;

  -- The attempt must belong to the caller. The master account does not write
  -- answers on a student's behalf: that would make the raw results untrue.
  if not exists (
    select 1 from public.student_profiles p
     where p.id = v_profile_id and p.user_id = auth.uid()
  ) then
    raise exception 'PULSE_NOT_YOURS: this attempt belongs to another student' using errcode = 'P0001';
  end if;

  if v_submitted is not null then
    raise exception 'PULSE_ATTEMPT_CLOSED: you have already handed this test in' using errcode = 'P0001';
  end if;

  if v_status <> 'published' then
    raise exception 'PULSE_TEST_CLOSED: this test is closed' using errcode = 'P0001';
  end if;

  if v_now > v_started + make_interval(mins => v_limit + 2) then
    raise exception 'PULSE_TIME_UP: the time for this test has run out' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.test_questions q
     where q.id = p_question_id and q.test_id = v_test_id
  ) then
    raise exception 'PULSE_WRONG_QUESTION: that question is not part of this test' using errcode = 'P0001';
  end if;

  insert into public.answers (student_profile_id, attempt_id, question_id, response)
  values (v_profile_id, p_attempt_id, p_question_id, p_response)
  on conflict (attempt_id, question_id) where question_id is not null
  do update set response = excluded.response, updated_at = v_now;

  return v_now;
end;
$$;

revoke all on function public.save_answer(uuid, uuid, text) from public;
grant execute on function public.save_answer(uuid, uuid, text) to authenticated;

-- Handing in, as one call, so the student is told rather than left guessing.
create or replace function public.hand_in_attempt(p_attempt_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_submitted timestamptz;
  v_now timestamptz := now();
begin
  select a.student_profile_id, a.submitted_at
    into v_profile_id, v_submitted
    from public.attempts a
   where a.id = p_attempt_id;

  if v_profile_id is null then
    raise exception 'PULSE_NOT_FOUND: no such attempt' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.student_profiles p
     where p.id = v_profile_id and p.user_id = auth.uid()
  ) then
    raise exception 'PULSE_NOT_YOURS: this attempt belongs to another student' using errcode = 'P0001';
  end if;

  if v_submitted is not null then
    raise exception 'PULSE_ATTEMPT_CLOSED: you have already handed this test in' using errcode = 'P0001';
  end if;

  update public.attempts set submitted_at = v_now where id = p_attempt_id;
  return v_now;
end;
$$;

revoke all on function public.hand_in_attempt(uuid) from public;
grant execute on function public.hand_in_attempt(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Answers survive a careless delete; a published test cannot be deleted
-- -----------------------------------------------------------------------------
-- Every delete path reaching `answers` is blocked at the answer itself, so one
-- set of constraints covers class → profile, module → test → question and
-- module → session → exercise alike. A class with answers can no longer be
-- removed by accident: archive it, or delete the answers deliberately first.
alter table public.answers drop constraint if exists answers_student_profile_id_fkey;
alter table public.answers
  add constraint answers_student_profile_id_fkey
  foreign key (student_profile_id) references public.student_profiles(id) on delete restrict;

alter table public.answers drop constraint if exists answers_attempt_id_fkey;
alter table public.answers
  add constraint answers_attempt_id_fkey
  foreign key (attempt_id) references public.attempts(id) on delete restrict;

alter table public.answers drop constraint if exists answers_question_id_fkey;
alter table public.answers
  add constraint answers_question_id_fkey
  foreign key (question_id) references public.test_questions(id) on delete restrict;

alter table public.answers drop constraint if exists answers_exercise_id_fkey;
alter table public.answers
  add constraint answers_exercise_id_fkey
  foreign key (exercise_id) references public.exercises(id) on delete restrict;

alter table public.attempts drop constraint if exists attempts_student_profile_id_fkey;
alter table public.attempts
  add constraint attempts_student_profile_id_fkey
  foreign key (student_profile_id) references public.student_profiles(id) on delete restrict;

alter table public.attempts drop constraint if exists attempts_test_id_fkey;
alter table public.attempts
  add constraint attempts_test_id_fkey
  foreign key (test_id) references public.tests(id) on delete restrict;

-- The question freeze was bypassable by deleting the parent test: the status
-- lookup then found no row and the guard passed. Refuse the delete itself.
create or replace function public.guard_test_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'PULSE_TEST_FROZEN: a published or closed test is versioned, never deleted'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists tests_delete_guard on public.tests;
create trigger tests_delete_guard
  before delete on public.tests
  for each row execute function public.guard_test_delete();

-- The question freeze read `public.tests` under the caller's RLS: a caller who
-- could not see the test got a null status and the guard silently allowed the
-- write. Harmless while only masters write, a hole the moment V1 adds teachers.
create or replace function public.guard_published_test_questions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_test_id uuid := coalesce(
    case when tg_op = 'DELETE' then null else new.test_id end,
    old.test_id
  );
begin
  select status into v_status from public.tests where id = v_test_id;

  -- No parent row: the test is being deleted. tests_delete_guard decides.
  if v_status is null then
    return coalesce(new, old);
  end if;

  if v_status <> 'draft' then
    raise exception 'PULSE_TEST_FROZEN: a published test cannot be edited — publish a new version'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. `anon` stays shut out of tables created later
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
revoke all on all tables in schema public from anon;

-- -----------------------------------------------------------------------------
-- Indexes the hot reads were missing
-- -----------------------------------------------------------------------------
create index if not exists answers_exercise_idx on public.answers (exercise_id) where exercise_id is not null;
create index if not exists answers_question_idx on public.answers (question_id) where question_id is not null;
create index if not exists attempts_profile_idx on public.attempts (student_profile_id);
create index if not exists exercises_session_idx on public.exercises (session_id);
create index if not exists session_materials_session_idx on public.session_materials (session_id);
create index if not exists classes_created_by_idx on public.classes (created_by);
create index if not exists modules_created_by_idx on public.modules (created_by);

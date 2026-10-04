-- =============================================================================
-- Pulse — RLS and data-rule tests (pgTAP). Run: `supabase test db`
-- Relies on supabase/seed.sql (fictional demo class). Everything rolls back.
-- Proves the V0 promises are database properties, not UI promises:
--   no self-enrollment · own results only · one attempt per test ·
--   answers frozen at hand-in · keys invisible to students · published tests frozen ·
--   late exercise answers accepted + flagged, on-time answers frozen once the next session opens.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(36);

-- Acting as someone: role + JWT claims, exactly as PostgREST does.
create or replace function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- Fixture: session 9 (prepared) whose next session (10) is a week away → its exercise is on time.
insert into sessions (id, module_id, n, title, scheduled_on, status) values
  ('40000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-0000000000d1', 9,  'Future session',      current_date,     'prepared'),
  ('40000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-0000000000d1', 10, 'Next future session', current_date + 7, 'empty');
insert into exercises (id, session_id, position, kind, prompt) values
  ('40000000-0000-4000-8000-000000000109', '40000000-0000-4000-8000-000000000009', 1, 'short', 'On-time exercise');

-- ---------------------------------------------------------------- the door
select throws_ok(
  $$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000099', 'stranger@nowhere.example') $$,
  'P0001', null, 'sign-up with an email that matches no profile is refused (no self-enrollment)');

select lives_ok(
  $$ insert into auth.users (id, email) values ('10000000-0000-4000-8000-0000000000a1', 'L.Fontaine@idrac.example') $$,
  'sign-up from a pre-created profile works (email match is case-insensitive)');
select is((select user_id from student_profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  '10000000-0000-4000-8000-0000000000a1'::uuid, 'the profile is claimed by the new account');

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-0000000000a2', 'y.cherif@idrac.example'),
  ('10000000-0000-4000-8000-0000000000b1', 'l.benali@abs.example'),
  ('10000000-0000-4000-8000-000000000001', 'master@pulse.example');
select is((select user_id from staff_accounts where email = 'master@pulse.example'),
  '10000000-0000-4000-8000-000000000001'::uuid, 'the master account is claimed the same way');

-- ------------------------------------------------------------ as Léa (B1)
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');

select is((select count(*) from student_profiles)::int, 1, 'a student sees only her own profile');
select is((select count(*) from classes)::int, 1, 'a student sees only her own class');
select is((select count(*) from modules)::int, 1, 'a student sees only the modules attached to her class');
select is((select count(*) from sessions)::int, 3, 'a student sees prepared sessions only (not draft/empty)');
select is((select count(*) from exercises)::int, 3, 'a student sees exercises of prepared sessions only');
select is((select count(*) from exercise_keys)::int, 0, 'exercise answer keys are invisible to students');
select is((select count(*) from test_question_keys)::int, 0, 'test answer keys are invisible to students');
select is((select count(*) from test_questions)::int, 4, 'a student sees the questions of the published test');

select lives_ok(
  $$ insert into attempts (id, test_id, student_profile_id) values
     ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000a1') $$,
  'a student can start the entrance test');
select throws_ok(
  $$ insert into attempts (test_id, student_profile_id) values
     ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000a1') $$,
  '23505', null, 'a second attempt on the same test is refused (one attempt per student)');

select lives_ok(
  $$ insert into answers (id, student_profile_id, attempt_id, question_id, response) values
     ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000301', 'Une erreur de calcul') $$,
  'a student can answer inside her open attempt');
update answers set response = 'Des étalements différents' where id = '30000000-0000-4000-8000-000000000001';
select is((select response from answers where id = '30000000-0000-4000-8000-000000000001'),
  'Des étalements différents', 'autosave: she can change an answer while the attempt is open');

select throws_ok(
  $$ insert into answers (student_profile_id, attempt_id, question_id, response) values
     ('00000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000302', 'x') $$,
  '42501', null, 'a student cannot write an answer for another student');

select lives_ok(
  $$ insert into answers (student_profile_id, exercise_id, response) values
     ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'Bimodale') $$,
  'a student can answer an exercise of a prepared session');
select throws_ok(
  $$ insert into answers (student_profile_id, exercise_id, response) values
     ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'x') $$,
  '42501', null, 'a student cannot answer an exercise of a session that is not prepared');
select is((select late from answers where exercise_id = '00000000-0000-4000-8000-000000000101'), true,
  'an exercise answered after the next session opened is accepted and flagged late');
update answers set response = 'Bimodale (corrigé)' where exercise_id = '00000000-0000-4000-8000-000000000101';
select is((select response from answers where exercise_id = '00000000-0000-4000-8000-000000000101'), 'Bimodale (corrigé)',
  'a late answer stays editable (it is not a report line)');
insert into answers (id, student_profile_id, exercise_id, response) values
  ('30000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-000000000109', 'on time');
select is((select late from answers where id = '30000000-0000-4000-8000-000000000109'), false,
  'an exercise answered before the next session opens is on time');

update attempts set submitted_at = now() where id = '20000000-0000-4000-8000-000000000001';
select isnt((select submitted_at from attempts where id = '20000000-0000-4000-8000-000000000001'), null, 'she can hand in');

update answers set response = 'changed after hand-in' where id = '30000000-0000-4000-8000-000000000001';
select is((select response from answers where id = '30000000-0000-4000-8000-000000000001'),
  'Des étalements différents', 'answers are frozen once the test is handed in');
select throws_ok(
  $$ insert into answers (student_profile_id, attempt_id, question_id, response) values
     ('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000302', 'late') $$,
  '42501', null, 'no new answers after hand-in');
update attempts set submitted_at = null where id = '20000000-0000-4000-8000-000000000001';
select isnt((select submitted_at from attempts where id = '20000000-0000-4000-8000-000000000001'), null, 'a hand-in cannot be undone by the student');

-- The next session opens → the on-time answer becomes the report line and freezes.
select set_config('role', 'postgres', true);
update sessions set scheduled_on = current_date - 1 where id = '40000000-0000-4000-8000-000000000010';
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ update answers set response = 'edited after the deadline' where id = '30000000-0000-4000-8000-000000000109' $$,
  'P0001', null, 'an on-time answer is frozen once the next session opens (report line)');

-- ------------------------------------------------- as Yanis (same class)
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a2');
select is((select count(*) from answers)::int, 0, 'a classmate cannot see another student''s answers');
select is((select count(*) from raw_results)::int, 0, 'raw results show a student nothing about others');

-- ------------------------------------------------ as Lina (another class)
select pg_temp.act_as('10000000-0000-4000-8000-0000000000b1');
select is((select count(*) from modules where id = '00000000-0000-4000-8000-0000000000d1')::int, 0,
  'a student of another class cannot see a module not attached to her class');
select throws_ok(
  $$ insert into attempts (test_id, student_profile_id) values
     ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000b1') $$,
  '42501', null, 'she cannot start a test of a module that is not hers');

-- ----------------------------------------------------- as the master account
select pg_temp.act_as('10000000-0000-4000-8000-000000000001');
select is((select count(*) from raw_results where student_name = 'Léa Fontaine')::int, 3,
  'the master account reads raw results (test + exercise answers, late flagged)');
select throws_ok(
  $$ update test_questions set prompt = 'edited' where id = '00000000-0000-4000-8000-000000000301' $$,
  'P0001', null, 'a published test is frozen — questions cannot be edited');
select throws_ok(
  $$ update tests set status = 'draft' where id = '00000000-0000-4000-8000-000000000201' $$,
  'P0001', null, 'a published test cannot return to draft');

-- ------------------------------------------------------------ anonymous
select set_config('role', 'anon', true), set_config('request.jwt.claims', '', true);
select lives_ok($$ select public.ping() $$, 'anon can call ping() (free-plan keep-alive)');
select throws_ok($$ select count(*) from public.modules $$, '42501', null, 'anon reads no table at all');

select * from finish();
rollback;

-- =============================================================================
-- Pulse — the paths the first two suites left out (pgTAP). Run: `supabase test db`
-- Listed by the schema review of 4 Oct 2026. Relies on supabase/seed.sql
-- (fictional demo class). Everything rolls back.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

create or replace function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-0000000000a1', 'l.fontaine@idrac.example'),
  ('10000000-0000-4000-8000-0000000000b1', 'l.benali@abs.example'),
  ('10000000-0000-4000-8000-000000000001', 'master@pulse.example');

-- ------------------------------------------------------ 1. the time limit holds
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');
insert into attempts (id, test_id, student_profile_id) values
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000a1');

-- Only the master can move an attempt's clock (guard_attempt_update lets masters through).
select pg_temp.act_as('10000000-0000-4000-8000-000000000001');
update attempts set started_at = now() - interval '30 minutes'
 where id = '70000000-0000-4000-8000-000000000001';

select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');
select throws_like(
  $$ select save_answer('70000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000301', 'too late') $$,
  '%PULSE_TIME_UP%', 'a save after the time limit and its two-minute grace is refused');

-- ---------------------------------------------------------- 2. session materials
select is((select count(*) from session_materials), 2::bigint,
  'a student reads the materials of the prepared sessions of their module');

select pg_temp.act_as('10000000-0000-4000-8000-0000000000b1');
select is((select count(*) from session_materials), 0::bigint,
  'a student of another class reads none of them');

-- --------------------------------------------- 3. one published test per module
select pg_temp.act_as('10000000-0000-4000-8000-000000000001');
insert into tests (id, module_id, version, status) values
  ('70000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000d1', 2, 'draft');
select throws_ok(
  $$ update tests set status = 'published' where id = '70000000-0000-4000-8000-000000000201' $$,
  '23505', null, 'a second published test on the same module is refused');

-- ----------------------------------- 4. a student writes nothing outside answers
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');
select throws_ok(
  $$ insert into modules (title) values ('Self-made module') $$,
  '42501', null, 'a student cannot create a module');
select throws_ok(
  $$ insert into classes (name, institution) values ('Self-made class', 'Nowhere') $$,
  '42501', null, 'a student cannot create a class');
select throws_ok(
  $$ insert into student_profiles (class_id, full_name, email)
     values ('00000000-0000-4000-8000-0000000000c1', 'A friend', 'friend@idrac.example') $$,
  '42501', null, 'a student cannot add a profile (no self-enrollment by the back door)');
select throws_ok(
  $$ insert into class_modules (class_id, module_id)
     values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2') $$,
  '42501', null, 'a student cannot attach their class to another module');
select throws_ok(
  $$ insert into tests (module_id) values ('00000000-0000-4000-8000-0000000000d1') $$,
  '42501', null, 'a student cannot create a test');
-- Aimed at the draft test of section 3, not the published one: on a published
-- test the freeze trigger fires before RLS (BEFORE ROW triggers run before
-- WITH CHECK) and refuses everyone, master included, so it would not show that
-- RLS keeps a student out. On a draft test, RLS is the only thing in the way.
select throws_ok(
  $$ insert into test_questions (test_id, position, kind, prompt)
     values ('70000000-0000-4000-8000-000000000201', 9, 'short', 'Planted question') $$,
  '42501', null, 'a student cannot add a question to a test');

select * from finish();
rollback;

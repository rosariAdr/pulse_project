-- =============================================================================
-- Pulse — V0 hardening tests (pgTAP). Run: `supabase test db`
-- Covers the five defects fixed by 20261004120000_v0_hardening.sql, each one
-- written so it would fail against the schema as it was before.
-- Relies on supabase/seed.sql (fictional demo class). Everything rolls back.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(18);

create or replace function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- Accounts: Léa and Yanis are in B1 · Groupe 2 (module ST), plus the master.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-0000000000a1', 'l.fontaine@idrac.example'),
  ('10000000-0000-4000-8000-0000000000a2', 'y.cherif@idrac.example'),
  ('10000000-0000-4000-8000-000000000001', 'master@pulse.example');

-- ------------------------------------------------- 1. the server owns the clock
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');

insert into attempts (id, test_id, student_profile_id, started_at)
values ('50000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-0000000000a1',
        now() + interval '10 years');

select ok(
  (select started_at from attempts where id = '50000000-0000-4000-8000-000000000001') <= now(),
  'a started_at sent by the phone is replaced by the server clock (the time limit is enforceable)');

select ok(
  (select submitted_at from attempts where id = '50000000-0000-4000-8000-000000000001') is null,
  'an attempt cannot be born already handed in');

-- ------------------------------------------------------------- 2. save_answer
select lives_ok(
  $$ select save_answer('50000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000301',
                        'Des étalements différents') $$,
  'a student saves an answer in one call');

select is(
  (select response from answers where attempt_id = '50000000-0000-4000-8000-000000000001'
     and question_id = '00000000-0000-4000-8000-000000000301'),
  'Des étalements différents', 'the answer is stored');

select lives_ok(
  $$ select save_answer('50000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000301',
                        'Une erreur de calcul') $$,
  'saving the same question again overwrites rather than failing (autosave)');

select is(
  (select count(*) from answers where attempt_id = '50000000-0000-4000-8000-000000000001'),
  1::bigint, 'autosave keeps one row per question');

select throws_ok(
  $$ select save_answer('50000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000301',
                        repeat('x', 5001)) $$,
  'P0001', null, 'an answer longer than 5000 characters is refused');

select throws_ok(
  $$ select save_answer('50000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000101',
                        'wrong test') $$,
  'P0001', null, 'a question from another test is refused');

-- -------------------------------------------- 3. an answer cannot be retargeted
select throws_ok(
  $$ update answers set exercise_id = '00000000-0000-4000-8000-000000000101', question_id = null, attempt_id = null
       where attempt_id = '50000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'a test answer cannot be turned into an exercise answer');

select throws_ok(
  $$ update answers set question_id = '00000000-0000-4000-8000-000000000302'
       where attempt_id = '50000000-0000-4000-8000-000000000001' $$,
  'P0001', null, 'an answer cannot be moved to another question');

-- ------------------------------------------- 4. another student is still shut out
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a2');

select throws_ok(
  $$ select save_answer('50000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000301',
                        'Yanis writing into Léa''s attempt') $$,
  'P0001', null, 'save_answer refuses a classmate''s attempt — security definer is not a way in');

select throws_ok(
  $$ select hand_in_attempt('50000000-0000-4000-8000-000000000001') $$,
  'P0001', null, 'hand_in_attempt refuses a classmate''s attempt');

-- --------------------------------------------- 5. handing in is final, and said
select pg_temp.act_as('10000000-0000-4000-8000-0000000000a1');

select isnt(
  (select hand_in_attempt('50000000-0000-4000-8000-000000000001')),
  null, 'the student hands the test in');

select throws_ok(
  $$ select hand_in_attempt('50000000-0000-4000-8000-000000000001') $$,
  'P0001', null, 'handing in twice is refused out loud, not silently ignored');

select throws_ok(
  $$ select save_answer('50000000-0000-4000-8000-000000000001',
                        '00000000-0000-4000-8000-000000000302',
                        'after the bell') $$,
  'P0001', null, 'saving after hand-in is refused out loud (no silent no-op)');

-- ------------------------------------- 6. the answers survive a careless delete
select pg_temp.act_as('10000000-0000-4000-8000-000000000001');

select throws_ok(
  $$ delete from classes where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '23503', null, 'deleting a class that holds answers is refused (no cascade to answers)');

select throws_ok(
  $$ delete from tests where id = '00000000-0000-4000-8000-000000000201' $$,
  'P0001', null, 'a published test cannot be deleted — version it instead');

-- --------------------------------------------- 7. anon stays out of new tables
create table public.later_table (id uuid primary key default gen_random_uuid());
set role anon;
select throws_ok(
  $$ select * from public.later_table $$,
  '42501', null, 'a table created by a later migration is not readable by anon');
reset role;

select * from finish();
rollback;

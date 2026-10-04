-- =============================================================================
-- Pulse — seeded demo class (dev only)
-- ALL names, emails and answers are FICTIONAL DEMONSTRATION DATA. Not pilot evidence.
-- Runs after migrations on `supabase db reset`. Never run against production.
--
-- To sign in locally as the master account, sign up in the app with
-- master@pulse.example (the profile is pre-created below). Replace with the
-- founders' real emails only in the production provisioning step, never here.
-- =============================================================================

insert into public.staff_accounts (id, email, display_name) values
  ('00000000-0000-4000-8000-000000000001', 'master@pulse.example', 'Demo master account');

insert into public.classes (id, name, institution, level, created_by) values
  ('00000000-0000-4000-8000-0000000000c1', 'B1 · Groupe 2', 'IDRAC Toulouse (demo)', 'B1', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000c2', 'M2-03',         'ABS Paris (demo)',      'M2', '00000000-0000-4000-8000-000000000001');

insert into public.student_profiles (id, class_id, full_name, email) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'Léa Fontaine',  'l.fontaine@idrac.example'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', 'Yanis Cherif',  'y.cherif@idrac.example'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000c1', 'Manon Dubois',  'm.dubois@idrac.example'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000c1', 'Tom Rivière',   't.riviere@idrac.example'),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000c1', 'Aya Benkirane', 'a.benkirane@idrac.example'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c2', 'Lina Benali',   'l.benali@abs.example'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c2', 'Hugo Martin',   'h.martin@abs.example');

insert into public.modules (id, code, title, level, language, session_count, created_by) values
  ('00000000-0000-4000-8000-0000000000d1', 'ST', 'Statistiques commerciales', 'B1', 'fr', 8, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000d2', 'DM', 'Data-Driven Marketing',     'M2', 'en', 8, '00000000-0000-4000-8000-000000000001');

insert into public.class_modules (class_id, module_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2');

insert into public.sessions (id, module_id, n, title, scheduled_on, status, summary) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', 1, 'Lire une distribution',     '2026-09-02', 'prepared', 'Effectifs, fréquences et histogrammes : ce qu''une distribution montre avant tout calcul.'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d1', 2, 'Tendance centrale',         '2026-09-09', 'prepared', 'Moyenne, médiane, mode : laquelle choisir, et pourquoi.'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000d1', 3, 'Dispersion et variance',    '2026-09-16', 'draft',    null),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000d1', 4, 'Covariance et corrélation', '2026-09-23', 'empty',    null),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000d1', 5, 'Régression simple',         '2026-09-30', 'empty',    null),
  ('00000000-0000-4000-8000-0000000000e6', '00000000-0000-4000-8000-0000000000d1', 6, 'Séries temporelles',        '2026-10-07', 'empty',    null),
  ('00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-0000000000d1', 7, 'Indices et taux',           '2026-10-14', 'empty',    null),
  ('00000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-0000000000d1', 8, 'Synthèse',                  '2026-10-21', 'empty',    null),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000d2', 1, 'Data quality foundations',  '2026-09-03', 'prepared', 'What makes a dataset trustworthy enough to decide on.');

insert into public.session_materials (session_id, position, kind, title, url) values
  ('00000000-0000-4000-8000-0000000000e1', 1, 'slides', 'Lire une distribution — 14 diapositives', 'https://example.org/demo/slides-s1.pdf'),
  ('00000000-0000-4000-8000-0000000000e1', 2, 'notes',  'Notes de séance',                          'https://example.org/demo/notes-s1');

insert into public.exercises (id, session_id, position, kind, prompt, options, skill) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000e1', 1, 'mcq',      'Un histogramme présente deux pics nettement séparés. Comment qualifie-t-on cette distribution ?', '["Symétrique","Bimodale","Uniforme","Asymétrique à gauche"]', 'Lecture de distribution'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000e1', 2, 'short',    'En une phrase : quelle est la différence entre un effectif et une fréquence ?', null, 'Lecture de distribution'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000e3', 1, 'judgment', 'Un collègue conclut que deux régions « se comportent pareil » car les moyennes sont proches. Que vérifiez-vous ?', null, 'Jugement statistique');

insert into public.exercise_keys (exercise_id, correct_answer, advice) values
  ('00000000-0000-4000-8000-000000000101', 'Bimodale', 'Deux pics = deux sous-populations possibles : revoir la séance 1.');

-- The entrance test for Statistiques commerciales: created as draft, questions added, then published.
insert into public.tests (id, module_id, version, status, time_limit_minutes) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000d1', 1, 'draft', 20);

insert into public.test_questions (id, test_id, position, kind, prompt, options, skill) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 1, 'mcq',      'Deux séries ont la même moyenne mais des écarts-types très différents. Qu''est-ce que cela indique ?', '["Une erreur de calcul","Des étalements différents","Des médianes différentes"]', 'Dispersion'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000201', 2, 'mcq',      'Quelle mesure est la moins sensible aux valeurs extrêmes ?', '["La moyenne","La médiane","L''étendue"]', 'Tendance centrale'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000201', 3, 'short',    'Donnez un exemple de variable qualitative ordinale.', null, 'Organisation des données'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000201', 4, 'judgment', 'On vous donne une distribution sans son échelle. Quelles deux questions posez-vous avant de l''interpréter ?', null, 'Jugement statistique');

insert into public.test_question_keys (question_id, correct_answer, advice) values
  ('00000000-0000-4000-8000-000000000301', 'Des étalements différents', 'Séance 3 — Dispersion et variance.'),
  ('00000000-0000-4000-8000-000000000302', 'La médiane',                'Séance 2 — Tendance centrale.');

update public.tests set status = 'published' where id = '00000000-0000-4000-8000-000000000201';

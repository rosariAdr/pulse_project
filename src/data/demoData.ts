/**
 * The same fictional demo class as supabase/seed.sql, for the in-memory repo.
 * ALL names, emails and content are FICTIONAL. Never pilot evidence.
 * Keep the ids identical to the seed so a screen behaves the same either way.
 */
import type { QuestionKind, TestStatus } from './types'

const U = '00000000-0000-4000-8000-'

export const demo = {
  staff: [{ id: `${U}000000000001`, email: 'master@pulse.example', name: 'Demo master account' }],

  classes: [
    { id: `${U}0000000000c1`, name: 'B1 · Groupe 2', institution: 'IDRAC Toulouse (demo)' },
    { id: `${U}0000000000c2`, name: 'M2-03', institution: 'ABS Paris (demo)' },
  ],

  profiles: [
    { id: `${U}0000000000a1`, classId: `${U}0000000000c1`, name: 'Léa Fontaine', email: 'l.fontaine@idrac.example' },
    { id: `${U}0000000000a2`, classId: `${U}0000000000c1`, name: 'Yanis Cherif', email: 'y.cherif@idrac.example' },
    { id: `${U}0000000000a3`, classId: `${U}0000000000c1`, name: 'Manon Dubois', email: 'm.dubois@idrac.example' },
    { id: `${U}0000000000a4`, classId: `${U}0000000000c1`, name: 'Tom Rivière', email: 't.riviere@idrac.example' },
    { id: `${U}0000000000a5`, classId: `${U}0000000000c1`, name: 'Aya Benkirane', email: 'a.benkirane@idrac.example' },
    { id: `${U}0000000000b1`, classId: `${U}0000000000c2`, name: 'Lina Benali', email: 'l.benali@abs.example' },
    { id: `${U}0000000000b2`, classId: `${U}0000000000c2`, name: 'Hugo Martin', email: 'h.martin@abs.example' },
  ],

  modules: [
    { id: `${U}0000000000d1`, code: 'ST', title: 'Statistiques commerciales', language: 'fr', sessionCount: 8 },
    { id: `${U}0000000000d2`, code: 'DM', title: 'Data-Driven Marketing', language: 'en', sessionCount: 8 },
  ],

  classModules: [
    { classId: `${U}0000000000c1`, moduleId: `${U}0000000000d1` },
    { classId: `${U}0000000000c2`, moduleId: `${U}0000000000d2` },
  ],

  tests: [
    {
      id: `${U}000000000201`,
      moduleId: `${U}0000000000d1`,
      version: 1,
      status: 'published' as TestStatus,
      timeLimitMinutes: 20,
    },
  ],

  questions: [
    {
      id: `${U}000000000301`,
      testId: `${U}000000000201`,
      position: 1,
      kind: 'mcq' as QuestionKind,
      prompt:
        'Deux séries ont la même moyenne mais des écarts-types très différents. Qu’est-ce que cela indique ?',
      options: ['Une erreur de calcul', 'Des étalements différents', 'Des médianes différentes'],
      skill: 'Dispersion',
    },
    {
      id: `${U}000000000302`,
      testId: `${U}000000000201`,
      position: 2,
      kind: 'mcq' as QuestionKind,
      prompt: 'Quelle mesure est la moins sensible aux valeurs extrêmes ?',
      options: ['La moyenne', 'La médiane', 'L’étendue'],
      skill: 'Tendance centrale',
    },
    {
      id: `${U}000000000303`,
      testId: `${U}000000000201`,
      position: 3,
      kind: 'short' as QuestionKind,
      prompt: 'Donnez un exemple de variable qualitative ordinale.',
      options: null,
      skill: 'Organisation des données',
    },
    {
      id: `${U}000000000304`,
      testId: `${U}000000000201`,
      position: 4,
      kind: 'judgment' as QuestionKind,
      prompt:
        'On vous donne une distribution sans son échelle. Quelles deux questions posez-vous avant de l’interpréter ?',
      options: null,
      skill: 'Jugement statistique',
    },
  ],
}

/** The password every demo account uses locally. Development only. */
export const DEMO_PASSWORD = 'pulse-demo'

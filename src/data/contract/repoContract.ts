import { beforeAll, describe, expect, it } from 'vitest'
import type { PulseRepo } from '../repo'
import { PulseError } from '../types'

/**
 * The repository's behaviour, written once and run against every
 * implementation. Scenarios run in order and share state, as a real database
 * does: each uses its own student so they do not interfere.
 *
 * If an implementation fails a scenario, fix the implementation. Change a
 * scenario only when the behaviour it states is wrong, and say why in the PR.
 */
export type ContractHarness = {
  repo: PulseRepo
  /** Signs this account in, creating it from its profile on first use. */
  actAs(email: string): Promise<void>
}

export const SEED = {
  stat: '00000000-0000-4000-8000-0000000000d1', // published test, class B1 · Groupe 2
  ddm: '00000000-0000-4000-8000-0000000000d2', // no test, class M2-03
  exerciseNotAQuestion: '00000000-0000-4000-8000-000000000101',
  lea: 'l.fontaine@idrac.example',
  yanis: 'y.cherif@idrac.example',
  lina: 'l.benali@abs.example',
  master: 'master@pulse.example',
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return 'no-error'
  } catch (e) {
    return e instanceof PulseError ? e.code : `not a PulseError: ${String(e)}`
  }
}

export function describeRepoContract(name: string, setup: () => Promise<ContractHarness>) {
  describe.sequential(`PulseRepo contract — ${name}`, () => {
    let h: ContractHarness
    let leaAttempt = ''
    let q1 = ''
    let q2 = ''

    beforeAll(async () => {
      h = await setup()
    }, 60_000)

    it('refuses an email with no pre-created profile — no self-enrollment', async () => {
      await h.repo.auth.signOut()
      expect(await codeOf(() => h.repo.auth.claimProfile('stranger@nowhere.example', 'a-good-password'))).toBe(
        'NO_PROFILE',
      )
    })

    it('shows a student the modules of their own class only', async () => {
      await h.actAs(SEED.lea)
      expect((await h.repo.student.modules()).map((m) => m.title)).toEqual(['Statistiques commerciales'])
      expect(await h.repo.student.module(SEED.ddm)).toBeNull()
      expect(await h.repo.student.test(SEED.ddm)).toBeNull()
    })

    it('refuses to start the test of another class', async () => {
      expect(await codeOf(() => h.repo.student.startAttempt(SEED.ddm))).toBe('TEST_NOT_AVAILABLE')
    })

    it('saves answers as they are written and reads them back', async () => {
      const attempt = await h.repo.student.startAttempt(SEED.stat)
      leaAttempt = attempt.id
      const test = (await h.repo.student.test(SEED.stat))!
      ;[q1, q2] = test.questions.map((q) => q.id)

      await h.repo.student.saveAnswer(leaAttempt, q1, 'Une erreur de calcul')
      await h.repo.student.saveAnswer(leaAttempt, q1, 'Des étalements différents')

      const reread = (await h.repo.student.test(SEED.stat))!
      expect(reread.attempt?.id).toBe(leaAttempt)
      expect(reread.answers[q1]).toBe('Des étalements différents')
      expect(reread.answers[q2]).toBeUndefined()
    })

    it('allows one attempt per student per test', async () => {
      expect(await codeOf(() => h.repo.student.startAttempt(SEED.stat))).toBe('ATTEMPT_EXISTS')
    })

    it('refuses a question that belongs to another test', async () => {
      expect(await codeOf(() => h.repo.student.saveAnswer(leaAttempt, SEED.exerciseNotAQuestion, 'x'))).toBe(
        'NOT_AUTHORISED',
      )
    })

    it('refuses an answer longer than the database accepts', async () => {
      expect(await codeOf(() => h.repo.student.saveAnswer(leaAttempt, q2, 'x'.repeat(5001)))).toBe('ANSWER_TOO_LONG')
    })

    it('never lets a classmate read or write a student’s answers', async () => {
      await h.actAs(SEED.yanis)
      expect(await codeOf(() => h.repo.student.saveAnswer(leaAttempt, q1, 'overwritten'))).toBe('NOT_AUTHORISED')
      const own = (await h.repo.student.test(SEED.stat))!
      expect(own.attempt).toBeNull()
      expect(own.answers).toEqual({})
    })

    it('keeps the teacher’s views away from students', async () => {
      expect(await codeOf(() => h.repo.teacher.modules())).toBe('NOT_AUTHORISED')
      expect(await codeOf(() => h.repo.teacher.rawResults(SEED.stat))).toBe('NOT_AUTHORISED')
    })

    it('hands in once, then refuses changes out loud', async () => {
      await h.actAs(SEED.lea)
      const handed = await h.repo.student.handIn(leaAttempt)
      expect(handed.submittedAt).not.toBeNull()
      expect(await codeOf(() => h.repo.student.saveAnswer(leaAttempt, q2, 'after the bell'))).toBe('ATTEMPT_CLOSED')
      expect(await codeOf(() => h.repo.student.handIn(leaAttempt))).toBe('ATTEMPT_CLOSED')
      expect((await h.repo.student.module(SEED.stat))?.testStatus).toBe('handed-in')
    })

    it('gives the teacher every student of the class and exactly what they wrote', async () => {
      await h.actAs(SEED.master)
      const raw = await h.repo.teacher.rawResults(SEED.stat)

      expect(raw.students).toHaveLength(5)
      const lea = raw.answers.filter((a) => a.studentName === 'Léa Fontaine')
      expect(lea.find((a) => a.questionId === q1)?.response).toBe('Des étalements différents')
      expect(lea.find((a) => a.questionId === q2)?.response).toBe('')
      expect(lea.every((a) => a.submittedAt !== null)).toBe(true)
      expect(raw.answers.some((a) => a.studentName === 'Yanis Cherif')).toBe(false)
    })

    it('counts hand-ins per module', async () => {
      const stat = (await h.repo.teacher.modules()).find((m) => m.id === SEED.stat)!
      expect(stat.studentCount).toBe(5)
      expect(stat.handedIn).toBe(1)
      expect(stat.testStatus).toBe('published')
    })

    it('writes a test as a draft and publishes it once', async () => {
      const draft = await h.repo.teacher.createDraft(SEED.ddm)
      expect(draft.status).toBe('draft')
      expect(draft.version).toBe(1)

      expect(await codeOf(() => h.repo.teacher.publish(draft.id))).toBe('TEST_EMPTY')
      expect(await codeOf(() => h.repo.teacher.createDraft(SEED.ddm))).toBe('TEST_ALREADY_DRAFTED')

      const written = await h.repo.teacher.addQuestion(draft.id, {
        kind: 'short',
        prompt: 'What makes a dataset trustworthy enough to decide on?',
        options: null,
        skill: 'Data quality',
      })
      expect(
        await codeOf(() =>
          h.repo.teacher.addQuestion(draft.id, { kind: 'mcq', prompt: 'One option?', options: ['Only'], skill: null }),
        ),
      ).toBe('QUESTION_INCOMPLETE')
      const choice = await h.repo.teacher.addQuestion(draft.id, {
        kind: 'mcq',
        prompt: 'Which measure resists outliers?',
        options: ['The mean', 'The median'],
        skill: null,
      })
      expect(choice.options).toEqual(['The mean', 'The median'])
      expect(choice.position).toBe(2)

      await h.repo.teacher.publish(draft.id)
      expect((await h.repo.teacher.test(SEED.ddm))?.status).toBe('published')
      expect(
        await codeOf(() =>
          h.repo.teacher.updateQuestion(written.id, {
            kind: written.kind,
            prompt: 'Edited after publishing',
            options: written.options,
            skill: written.skill,
          }),
        ),
      ).toBe('TEST_FROZEN')
    })

    it('shows a published test to the students of that class', async () => {
      await h.actAs(SEED.lina)
      const test = (await h.repo.student.test(SEED.ddm))!
      expect(test.questions.map((q) => q.prompt)).toEqual([
        'What makes a dataset trustworthy enough to decide on?',
        'Which measure resists outliers?',
      ])
    })
  })
}

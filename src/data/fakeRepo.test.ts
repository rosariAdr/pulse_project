import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_PASSWORD, demo } from './demoData'
import { createFakeRepo } from './fakeRepo'
import { PulseError } from './types'

const LEA = 'l.fontaine@idrac.example' // class B1 · Groupe 2 → Statistiques commerciales
const YANIS = 'y.cherif@idrac.example' // same class
const LINA = 'l.benali@abs.example' // other class → Data-Driven Marketing
const MASTER = 'master@pulse.example'
const STAT = demo.modules[0].id
const DDM = demo.modules[1].id

let repo: ReturnType<typeof createFakeRepo>

beforeEach(() => {
  repo = createFakeRepo()
})

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 'no-error'
  } catch (e) {
    return e instanceof PulseError ? e.code : 'not-a-pulse-error'
  }
}

describe('the door', () => {
  it('signs a seeded student in', async () => {
    const viewer = await repo.auth.signIn(LEA, DEMO_PASSWORD)
    expect(viewer.kind).toBe('student')
    expect(viewer.name).toBe('Léa Fontaine')
  })

  it('refuses an email with no pre-created profile — no self-enrollment', async () => {
    expect(await codeOf(() => repo.auth.claimProfile('stranger@nowhere.example', 'whatever-123'))).toBe('NO_PROFILE')
  })

  it('matches the profile email whatever the case', async () => {
    const viewer = await repo.auth.signIn('L.Fontaine@IDRAC.example', DEMO_PASSWORD)
    expect(viewer.email).toBe(LEA)
  })

  it('says nothing about whether an email exists when resetting a password', async () => {
    await expect(repo.auth.requestPasswordReset('stranger@nowhere.example')).resolves.toBeUndefined()
  })
})

describe('a student and their modules', () => {
  it('sees the modules of their own class only', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const modules = await repo.student.modules()
    expect(modules.map((m) => m.title)).toEqual(['Statistiques commerciales'])
  })

  it('cannot reach a module attached to another class', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    expect(await repo.student.module(DDM)).toBeNull()
    expect(await repo.student.test(DDM)).toBeNull()
    expect(await codeOf(() => repo.student.startAttempt(DDM))).toBe('TEST_NOT_AVAILABLE')
  })

  it('reports the test state as the student moves through it', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    expect((await repo.student.modules())[0].testStatus).toBe('not-started')

    const attempt = await repo.student.startAttempt(STAT)
    expect((await repo.student.modules())[0].testStatus).toBe('in-progress')

    await repo.student.handIn(attempt.id)
    expect((await repo.student.modules())[0].testStatus).toBe('handed-in')
  })

  it('shows a module with no published test as having none', async () => {
    await repo.auth.signIn(LINA, DEMO_PASSWORD)
    const modules = await repo.student.modules()
    expect(modules).toHaveLength(1)
    expect(modules[0].testStatus).toBe('none')
  })
})

describe('taking the test', () => {
  it('saves an answer and reads it back — autosave and resume', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const attempt = await repo.student.startAttempt(STAT)
    const [q1] = (await repo.student.test(STAT))!.questions

    await repo.student.saveAnswer(attempt.id, q1.id, 'Des étalements différents')
    await repo.student.saveAnswer(attempt.id, q1.id, 'Une erreur de calcul') // changed their mind

    const test = (await repo.student.test(STAT))!
    expect(test.answers[q1.id]).toBe('Une erreur de calcul')
    expect(test.attempt?.id).toBe(attempt.id)
  })

  it('allows one attempt only', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    await repo.student.startAttempt(STAT)
    expect(await codeOf(() => repo.student.startAttempt(STAT))).toBe('ATTEMPT_EXISTS')
  })

  it('refuses a late answer out loud rather than silently dropping it', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const attempt = await repo.student.startAttempt(STAT)
    const [q1] = (await repo.student.test(STAT))!.questions
    await repo.student.handIn(attempt.id)

    expect(await codeOf(() => repo.student.saveAnswer(attempt.id, q1.id, 'too late'))).toBe('ATTEMPT_CLOSED')
  })

  it('cannot be handed in twice', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const attempt = await repo.student.startAttempt(STAT)
    const first = await repo.student.handIn(attempt.id)
    expect(await codeOf(() => repo.student.handIn(attempt.id))).toBe('ATTEMPT_CLOSED')
    expect((await repo.student.test(STAT))!.attempt?.submittedAt).toBe(first.submittedAt)
  })

  it('refuses a question that belongs to another test', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const attempt = await repo.student.startAttempt(STAT)
    expect(await codeOf(() => repo.student.saveAnswer(attempt.id, 'some-other-question', 'x'))).toBe('NOT_AUTHORISED')
  })
})

describe('own results only', () => {
  it('refuses to write into a classmate’s attempt', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const lea = await repo.student.startAttempt(STAT)
    const [q1] = (await repo.student.test(STAT))!.questions
    await repo.student.saveAnswer(lea.id, q1.id, 'Léa’s answer')

    await repo.auth.signIn(YANIS, DEMO_PASSWORD)
    expect(await codeOf(() => repo.student.saveAnswer(lea.id, q1.id, 'Yanis overwriting'))).toBe('NOT_AUTHORISED')
    expect(await codeOf(() => repo.student.handIn(lea.id))).toBe('NOT_AUTHORISED')
  })

  it('never shows a classmate’s answers', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const lea = await repo.student.startAttempt(STAT)
    const [q1] = (await repo.student.test(STAT))!.questions
    await repo.student.saveAnswer(lea.id, q1.id, 'Léa’s answer')

    await repo.auth.signIn(YANIS, DEMO_PASSWORD)
    const test = (await repo.student.test(STAT))!
    expect(test.attempt).toBeNull()
    expect(test.answers).toEqual({})
  })

  it('keeps the raw results away from students', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    expect(await codeOf(() => repo.teacher.rawResults(STAT))).toBe('NOT_AUTHORISED')
    expect(await codeOf(() => repo.teacher.modules())).toBe('NOT_AUTHORISED')
  })
})

describe('what the teacher reads', () => {
  it('lists every student of the attached classes and what they answered', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const attempt = await repo.student.startAttempt(STAT)
    const questions = (await repo.student.test(STAT))!.questions
    await repo.student.saveAnswer(attempt.id, questions[0].id, 'Des étalements différents')
    await repo.student.saveAnswer(attempt.id, questions[2].id, 'Un niveau de satisfaction')
    await repo.student.handIn(attempt.id)

    await repo.auth.signIn(MASTER, DEMO_PASSWORD)
    const raw = await repo.teacher.rawResults(STAT)

    expect(raw.students).toHaveLength(5) // the whole class, including those who did nothing
    expect(raw.questions).toHaveLength(4)
    expect(raw.answers).toHaveLength(4) // one row per question for the one student who took it

    const lea = raw.answers.filter((a) => a.studentName === 'Léa Fontaine')
    expect(lea.find((a) => a.questionPosition === 1)?.response).toBe('Des étalements différents')
    expect(lea.find((a) => a.questionPosition === 2)?.response).toBe('') // left blank
    expect(lea.every((a) => a.submittedAt !== null)).toBe(true)
  })

  it('counts hand-ins per module', async () => {
    await repo.auth.signIn(LEA, DEMO_PASSWORD)
    const attempt = await repo.student.startAttempt(STAT)
    await repo.student.handIn(attempt.id)

    await repo.auth.signIn(MASTER, DEMO_PASSWORD)
    const modules = await repo.teacher.modules()
    const stat = modules.find((m) => m.id === STAT)!
    expect(stat.studentCount).toBe(5)
    expect(stat.handedIn).toBe(1)
    expect(stat.testStatus).toBe('published')
  })
})

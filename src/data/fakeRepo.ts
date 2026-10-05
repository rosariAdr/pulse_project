import { DEMO_PASSWORD, demo } from './demoData'
import type { PulseRepo } from './repo'
import {
  MAX_ANSWER_LENGTH,
  PulseError,
  type Attempt,
  type Question,
  type RawAnswer,
  type RawResults,
  type StudentModule,
  type TeacherModule,
  type TestForTeacher,
  type TestForStudent,
  type TestStatus,
  type NewQuestion,
  type Viewer,
} from './types'

/**
 * In-memory implementation of PulseRepo, seeded with the same fictional class as
 * supabase/seed.sql. It exists so screens can be built and tested without Docker
 * or a Supabase project.
 *
 * It imitates the database's rules — own answers only, one attempt, closed after
 * hand-in — so a screen written against it behaves the same against the real
 * database. The rules themselves are guaranteed by RLS, not by this file; this
 * is a development double, never a security boundary.
 */

type Account = { email: string; password: string }
type AnswerRow = { attemptId: string; questionId: string; studentProfileId: string; response: string }

type TestRow = {
  id: string
  moduleId: string
  version: number
  status: TestStatus
  timeLimitMinutes: number
}
type QuestionRow = Question & { testId: string }

export type FakeState = {
  accounts: Account[]
  attempts: Attempt[]
  answers: AnswerRow[]
  /** Tests and questions live in the state, not in the demo constant: the teacher writes them. */
  tests: TestRow[]
  questions: QuestionRow[]
  viewerEmail: string | null
}

const lower = (s: string) => s.trim().toLowerCase()

/** The database holds the same rule: options exist exactly for a multiple choice. */
function checkedQuestion(question: NewQuestion): NewQuestion {
  const prompt = question.prompt.trim()
  if (!prompt) throw new PulseError('QUESTION_INCOMPLETE', 'A question needs a prompt.')

  if (question.kind === 'mcq') {
    const options = (question.options ?? []).map((o) => o.trim()).filter(Boolean)
    if (options.length < 2) {
      throw new PulseError('QUESTION_INCOMPLETE', 'A multiple choice needs at least two options.')
    }
    return { ...question, prompt, options }
  }
  return { ...question, prompt, options: null }
}

function freshState(): FakeState {
  return {
    // Every seeded profile already has an account, as in the local Supabase instructions.
    accounts: [...demo.staff, ...demo.profiles].map((p) => ({ email: lower(p.email), password: DEMO_PASSWORD })),
    attempts: [],
    answers: [],
    tests: demo.tests.map((t) => ({ ...t })),
    questions: demo.questions.map(({ testId, id, position, kind, prompt, options, skill }) => ({
      testId,
      id,
      position,
      kind,
      prompt,
      options: options ? [...options] : null,
      skill,
    })),
    viewerEmail: null,
  }
}

function viewerFor(email: string): Viewer | null {
  const staff = demo.staff.find((s) => lower(s.email) === lower(email))
  if (staff) return { kind: 'master', id: staff.id, name: staff.name, email: staff.email }

  const profiles = demo.profiles.filter((p) => lower(p.email) === lower(email))
  if (profiles.length === 0) return null
  return {
    kind: 'student',
    id: profiles[0].id,
    name: profiles[0].name,
    email: profiles[0].email,
    profileIds: profiles.map((p) => p.id),
  }
}

const questionsIn = (rows: QuestionRow[], testId: string): Question[] =>
  rows
    .filter((q) => q.testId === testId)
    .sort((a, b) => a.position - b.position)
    .map(({ id, position, kind, prompt, options, skill }) => ({ id, position, kind, prompt, options, skill }))

/** Where a persisted demo lives. Per browser, never shared, never read by Claude. */
const STORAGE_KEY = 'pulse.fake.v1'

function readStored(): Partial<FakeState> | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<FakeState>) : null
  } catch {
    return null // private mode, blocked storage, or a shape we no longer understand
  }
}

export function createFakeRepo(
  initial?: Partial<FakeState>,
  options?: { persist?: boolean },
): PulseRepo & { state: FakeState } {
  // Persistence is opt-in: the app asks for it so a refresh mid-demo keeps the
  // session and the answers; tests never do, so they start from a clean class.
  const stored = options?.persist ? readStored() : null
  const state: FakeState = { ...freshState(), ...stored, ...initial }

  const remember = () => {
    if (!options?.persist) return
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* a demo that cannot be saved still works for this visit */
    }
  }

  const requireViewer = (): Viewer => {
    const v = state.viewerEmail ? viewerFor(state.viewerEmail) : null
    if (!v) throw new PulseError('NOT_AUTHORISED', 'Nobody is signed in.')
    return v
  }

  const requireStudent = () => {
    const v = requireViewer()
    if (v.kind !== 'student') throw new PulseError('NOT_AUTHORISED', 'This is a student action.')
    return v
  }

  const requireMaster = () => {
    const v = requireViewer()
    if (v.kind !== 'master') throw new PulseError('NOT_AUTHORISED', 'This is a teacher action.')
    return v
  }

  /** The profile this student holds in the class the module is attached to. */
  const profileForModule = (viewer: Extract<Viewer, { kind: 'student' }>, moduleId: string) => {
    const classIds = demo.classModules.filter((cm) => cm.moduleId === moduleId).map((cm) => cm.classId)
    return demo.profiles.find((p) => viewer.profileIds.includes(p.id) && classIds.includes(p.classId)) ?? null
  }

  const publishedTestOf = (moduleId: string) =>
    state.tests.find((t) => t.moduleId === moduleId && t.status === 'published') ?? null

  const studentModule = (viewer: Extract<Viewer, { kind: 'student' }>, moduleId: string): StudentModule | null => {
    const profile = profileForModule(viewer, moduleId)
    const mod = demo.modules.find((m) => m.id === moduleId)
    if (!profile || !mod) return null
    const klass = demo.classes.find((c) => c.id === profile.classId)!
    const test = publishedTestOf(mod.id)
    const attempt = test ? state.attempts.find((a) => a.testId === test.id && a.studentProfileId === profile.id) : undefined

    return {
      id: mod.id,
      code: mod.code,
      title: mod.title,
      language: mod.language,
      className: klass.name,
      testId: test?.id ?? null,
      testStatus: !test ? 'none' : !attempt ? 'not-started' : attempt.submittedAt ? 'handed-in' : 'in-progress',
    }
  }

  /** A test can only be written while it is a draft — a live test is versioned. */
  const draftOrFail = (testId: string): TestRow => {
    const test = state.tests.find((t) => t.id === testId)
    if (!test) throw new PulseError('NOT_AUTHORISED', 'No such test.')
    if (test.status !== 'draft') {
      throw new PulseError('TEST_FROZEN', 'A published test is versioned, never edited.')
    }
    return test
  }

  const teacherTest = (test: TestRow, moduleTitle: string): TestForTeacher => ({
    id: test.id,
    moduleId: test.moduleId,
    moduleTitle,
    version: test.version,
    status: test.status,
    timeLimitMinutes: test.timeLimitMinutes,
    questions: questionsIn(state.questions, test.id),
    handedIn: state.attempts.filter((a) => a.testId === test.id && a.submittedAt !== null).length,
  })

  const openAttempt = (attemptId: string, studentProfileIds: string[]): Attempt => {
    const attempt = state.attempts.find((a) => a.id === attemptId)
    if (!attempt || !studentProfileIds.includes(attempt.studentProfileId)) {
      throw new PulseError('NOT_AUTHORISED', 'This attempt is not yours.')
    }
    if (attempt.submittedAt) throw new PulseError('ATTEMPT_CLOSED', 'You have already handed this test in.')
    return attempt
  }

  return {
    state,

    auth: {
      async current() {
        return state.viewerEmail ? viewerFor(state.viewerEmail) : null
      },
      async signIn(email, password) {
        const account = state.accounts.find((a) => a.email === lower(email))
        if (!account || account.password !== password) {
          throw new PulseError('BAD_CREDENTIALS', 'That email and password do not match.')
        }
        const viewer = viewerFor(email)
        if (!viewer) throw new PulseError('NO_PROFILE')
        state.viewerEmail = lower(email)
        remember()
        return viewer
      },
      async claimProfile(email, password) {
        const viewer = viewerFor(email)
        if (!viewer) throw new PulseError('NO_PROFILE', 'This email has no Pulse profile.')
        if (state.accounts.some((a) => a.email === lower(email))) {
          // Already claimed: signing in is the right path, and we never say more than that.
          throw new PulseError('BAD_CREDENTIALS', 'This profile already has an account. Sign in instead.')
        }
        state.accounts.push({ email: lower(email), password })
        state.viewerEmail = lower(email)
        remember()
        return viewer
      },
      async requestPasswordReset() {
        // Deliberately silent about whether the email exists.
      },
      async signOut() {
        state.viewerEmail = null
        remember()
      },
    },

    student: {
      async modules() {
        const viewer = requireStudent()
        const classIds = demo.profiles.filter((p) => viewer.profileIds.includes(p.id)).map((p) => p.classId)
        return demo.classModules
          .filter((cm) => classIds.includes(cm.classId))
          .map((cm) => studentModule(viewer, cm.moduleId))
          .filter((m): m is StudentModule => m !== null)
      },

      async module(moduleId) {
        return studentModule(requireStudent(), moduleId)
      },

      async test(moduleId) {
        const viewer = requireStudent()
        const profile = profileForModule(viewer, moduleId)
        const test = publishedTestOf(moduleId)
        if (!profile || !test) return null
        const mod = demo.modules.find((m) => m.id === moduleId)!
        const attempt = state.attempts.find((a) => a.testId === test.id && a.studentProfileId === profile.id) ?? null

        const answers: Record<string, string> = {}
        if (attempt) {
          for (const row of state.answers.filter((r) => r.attemptId === attempt.id)) {
            answers[row.questionId] = row.response
          }
        }

        return {
          testId: test.id,
          moduleId,
          moduleTitle: mod.title,
          timeLimitMinutes: test.timeLimitMinutes,
          questions: questionsIn(state.questions, test.id),
          attempt,
          answers,
        } satisfies TestForStudent
      },

      async startAttempt(moduleId) {
        const viewer = requireStudent()
        const profile = profileForModule(viewer, moduleId)
        const test = publishedTestOf(moduleId)
        if (!profile || !test) throw new PulseError('TEST_NOT_AVAILABLE')
        if (state.attempts.some((a) => a.testId === test.id && a.studentProfileId === profile.id)) {
          throw new PulseError('ATTEMPT_EXISTS', 'You have already started this test.')
        }
        const attempt: Attempt = {
          id: `attempt-${state.attempts.length + 1}`,
          testId: test.id,
          studentProfileId: profile.id,
          startedAt: new Date().toISOString(),
          submittedAt: null,
        }
        state.attempts.push(attempt)
        remember()
        return attempt
      },

      async saveAnswer(attemptId, questionId, response) {
        const viewer = requireStudent()
        const attempt = openAttempt(attemptId, viewer.profileIds)
        if (!state.questions.some((q) => q.id === questionId && q.testId === attempt.testId)) {
          throw new PulseError('NOT_AUTHORISED', 'That question belongs to another test.')
        }
        if (response.length > MAX_ANSWER_LENGTH) {
          throw new PulseError('ANSWER_TOO_LONG', `An answer is limited to ${MAX_ANSWER_LENGTH} characters.`)
        }
        // Same grace as save_answer() in the database: the limit plus two minutes.
        const test = state.tests.find((t) => t.id === attempt.testId)!
        const deadline = new Date(attempt.startedAt).getTime() + (test.timeLimitMinutes + 2) * 60_000
        if (Date.now() > deadline) {
          throw new PulseError('TIME_UP', 'The time for this test has run out.')
        }
        const existing = state.answers.find((r) => r.attemptId === attemptId && r.questionId === questionId)
        if (existing) existing.response = response
        else
          state.answers.push({
            attemptId,
            questionId,
            studentProfileId: attempt.studentProfileId,
            response,
          })
        remember()
      },

      async handIn(attemptId) {
        const viewer = requireStudent()
        const attempt = openAttempt(attemptId, viewer.profileIds)
        attempt.submittedAt = new Date().toISOString()
        remember()
        return attempt
      },
    },

    teacher: {
      async modules() {
        requireMaster()
        return demo.modules.map((mod) => {
          const classIds = demo.classModules.filter((cm) => cm.moduleId === mod.id).map((cm) => cm.classId)
          const profiles = demo.profiles.filter((p) => classIds.includes(p.classId))
          // What the class can see comes first; a draft is only what comes next.
          const tests = state.tests.filter((t) => t.moduleId === mod.id)
          const test = tests.find((t) => t.status === 'published') ?? tests.at(-1) ?? null
          const handedIn = test
            ? state.attempts.filter((a) => a.testId === test.id && a.submittedAt !== null).length
            : 0
          return {
            id: mod.id,
            code: mod.code,
            title: mod.title,
            language: mod.language,
            sessionCount: mod.sessionCount,
            classNames: demo.classes.filter((c) => classIds.includes(c.id)).map((c) => c.name),
            studentCount: profiles.length,
            testStatus: test?.status ?? 'none',
            testVersion: test?.version ?? null,
            handedIn,
          } satisfies TeacherModule
        })
      },

      async test(moduleId) {
        requireMaster()
        const mod = demo.modules.find((m) => m.id === moduleId)
        if (!mod) throw new PulseError('NOT_AUTHORISED', 'No such module.')
        const tests = state.tests.filter((t) => t.moduleId === moduleId)
        // The draft being written wins: it is what the teacher came here for.
        const test = tests.find((t) => t.status === 'draft') ?? tests.find((t) => t.status === 'published')
        return test ? teacherTest(test, mod.title) : null
      },

      async createDraft(moduleId) {
        requireMaster()
        const mod = demo.modules.find((m) => m.id === moduleId)
        if (!mod) throw new PulseError('NOT_AUTHORISED', 'No such module.')
        const existing = state.tests.filter((t) => t.moduleId === moduleId)
        if (existing.some((t) => t.status === 'draft')) {
          throw new PulseError('TEST_ALREADY_DRAFTED', 'This module already has a draft.')
        }
        // A published test is never edited: the next version starts empty.
        const draft: TestRow = {
          id: `test-${state.tests.length + 1}`,
          moduleId,
          version: Math.max(0, ...existing.map((t) => t.version)) + 1,
          status: 'draft',
          timeLimitMinutes: 20,
        }
        state.tests.push(draft)
        remember()
        return teacherTest(draft, mod.title)
      },

      async addQuestion(testId, question) {
        requireMaster()
        const test = draftOrFail(testId)
        const row: QuestionRow = {
          testId,
          id: `question-${state.questions.length + 1}`,
          position: questionsIn(state.questions, test.id).length + 1,
          ...checkedQuestion(question),
        }
        state.questions.push(row)
        remember()
        return { ...row }
      },

      async updateQuestion(questionId, question) {
        requireMaster()
        const row = state.questions.find((q) => q.id === questionId)
        if (!row) throw new PulseError('NOT_AUTHORISED', 'No such question.')
        draftOrFail(row.testId)
        Object.assign(row, checkedQuestion(question))
        remember()
        return { ...row }
      },

      async removeQuestion(questionId) {
        requireMaster()
        const row = state.questions.find((q) => q.id === questionId)
        if (!row) return
        draftOrFail(row.testId)
        state.questions = state.questions.filter((q) => q.id !== questionId)
        // Positions stay 1..n so the student sees no gap.
        questionsIn(state.questions, row.testId).forEach((q, i) => {
          const found = state.questions.find((x) => x.id === q.id)
          if (found) found.position = i + 1
        })
        remember()
      },

      async publish(testId) {
        requireMaster()
        const test = draftOrFail(testId)
        if (questionsIn(state.questions, testId).length === 0) {
          throw new PulseError('TEST_EMPTY', 'Add at least one question before publishing.')
        }
        // One published test per module: the previous version closes.
        for (const other of state.tests) {
          if (other.moduleId === test.moduleId && other.status === 'published') other.status = 'closed'
        }
        test.status = 'published'
        remember()
      },

      async rawResults(moduleId) {
        requireMaster()
        const mod = demo.modules.find((m) => m.id === moduleId)
        if (!mod) throw new PulseError('NOT_AUTHORISED', 'No such module.')
        const test = state.tests.find((t) => t.moduleId === moduleId) ?? null
        const classIds = demo.classModules.filter((cm) => cm.moduleId === moduleId).map((cm) => cm.classId)
        const profiles = demo.profiles.filter((p) => classIds.includes(p.classId))
        const questions = test ? questionsIn(state.questions, test.id) : []

        const attemptOf = (profileId: string) =>
          test ? (state.attempts.find((a) => a.testId === test.id && a.studentProfileId === profileId) ?? null) : null

        const answers: RawAnswer[] = []
        for (const profile of profiles) {
          const attempt = attemptOf(profile.id)
          if (!attempt) continue
          const klass = demo.classes.find((c) => c.id === profile.classId)!
          for (const question of questions) {
            const row = state.answers.find((r) => r.attemptId === attempt.id && r.questionId === question.id)
            answers.push({
              studentProfileId: profile.id,
              studentName: profile.name,
              className: klass.name,
              questionId: question.id,
              questionPosition: question.position,
              prompt: question.prompt,
              response: row?.response ?? '',
              submittedAt: attempt.submittedAt,
            })
          }
        }

        return {
          moduleId,
          moduleTitle: mod.title,
          testId: test?.id ?? null,
          questions,
          students: profiles.map((p) => ({
            profileId: p.id,
            name: p.name,
            className: demo.classes.find((c) => c.id === p.classId)!.name,
            submittedAt: attemptOf(p.id)?.submittedAt ?? null,
          })),
          answers,
        } satisfies RawResults
      },
    },
  }
}

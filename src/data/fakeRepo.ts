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
  type TestForStudent,
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

export type FakeState = {
  accounts: Account[]
  attempts: Attempt[]
  answers: AnswerRow[]
  viewerEmail: string | null
}

const lower = (s: string) => s.trim().toLowerCase()

function freshState(): FakeState {
  return {
    // Every seeded profile already has an account, as in the local Supabase instructions.
    accounts: [...demo.staff, ...demo.profiles].map((p) => ({ email: lower(p.email), password: DEMO_PASSWORD })),
    attempts: [],
    answers: [],
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

const questionsOf = (testId: string): Question[] =>
  demo.questions
    .filter((q) => q.testId === testId)
    .sort((a, b) => a.position - b.position)
    .map(({ id, position, kind, prompt, options, skill }) => ({ id, position, kind, prompt, options, skill }))

export function createFakeRepo(initial?: Partial<FakeState>): PulseRepo & { state: FakeState } {
  const state: FakeState = { ...freshState(), ...initial }

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
    demo.tests.find((t) => t.moduleId === moduleId && t.status === 'published') ?? null

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
        return viewer
      },
      async requestPasswordReset() {
        // Deliberately silent about whether the email exists.
      },
      async signOut() {
        state.viewerEmail = null
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
          questions: questionsOf(test.id),
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
        return attempt
      },

      async saveAnswer(attemptId, questionId, response) {
        const viewer = requireStudent()
        const attempt = openAttempt(attemptId, viewer.profileIds)
        if (!demo.questions.some((q) => q.id === questionId && q.testId === attempt.testId)) {
          throw new PulseError('NOT_AUTHORISED', 'That question belongs to another test.')
        }
        if (response.length > MAX_ANSWER_LENGTH) {
          throw new PulseError('ANSWER_TOO_LONG', `An answer is limited to ${MAX_ANSWER_LENGTH} characters.`)
        }
        // Same grace as save_answer() in the database: the limit plus two minutes.
        const test = demo.tests.find((t) => t.id === attempt.testId)!
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
      },

      async handIn(attemptId) {
        const viewer = requireStudent()
        const attempt = openAttempt(attemptId, viewer.profileIds)
        attempt.submittedAt = new Date().toISOString()
        return attempt
      },
    },

    teacher: {
      async modules() {
        requireMaster()
        return demo.modules.map((mod) => {
          const classIds = demo.classModules.filter((cm) => cm.moduleId === mod.id).map((cm) => cm.classId)
          const profiles = demo.profiles.filter((p) => classIds.includes(p.classId))
          const test = demo.tests.find((t) => t.moduleId === mod.id) ?? null
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

      async rawResults(moduleId) {
        requireMaster()
        const mod = demo.modules.find((m) => m.id === moduleId)
        if (!mod) throw new PulseError('NOT_AUTHORISED', 'No such module.')
        const test = demo.tests.find((t) => t.moduleId === moduleId) ?? null
        const classIds = demo.classModules.filter((cm) => cm.moduleId === moduleId).map((cm) => cm.classId)
        const profiles = demo.profiles.filter((p) => classIds.includes(p.classId))
        const questions = test ? questionsOf(test.id) : []

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

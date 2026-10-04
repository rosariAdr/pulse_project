/**
 * Domain types for V0 — the entrance-test loop.
 * They mirror supabase/migrations/*_v10_schema.sql. When the schema changes,
 * change these in the same pull request.
 */

export type QuestionKind = 'mcq' | 'short' | 'judgment'
export type TestStatus = 'draft' | 'published' | 'closed'

/** Who is signed in. V0 has two kinds: the founders' master account, and students. */
export type Viewer =
  | { kind: 'master'; id: string; name: string; email: string }
  | { kind: 'student'; id: string; name: string; email: string; profileIds: string[] }

export type Question = {
  id: string
  position: number
  kind: QuestionKind
  prompt: string
  /** Present exactly when kind === 'mcq'. */
  options: string[] | null
  skill: string | null
}

export type Attempt = {
  id: string
  testId: string
  studentProfileId: string
  startedAt: string
  submittedAt: string | null
}

/** A module as a student sees it: no other student, no answer key. */
export type StudentModule = {
  id: string
  code: string | null
  title: string
  language: string
  className: string
  /** null when the module has no published test. */
  testId: string | null
  testStatus: 'none' | 'not-started' | 'in-progress' | 'handed-in'
}

/** Everything the test screen needs in one read. */
export type TestForStudent = {
  testId: string
  moduleId: string
  moduleTitle: string
  timeLimitMinutes: number
  questions: Question[]
  attempt: Attempt | null
  /** questionId → the answer this student has saved so far. */
  answers: Record<string, string>
}

export type TeacherModule = {
  id: string
  code: string | null
  title: string
  language: string
  sessionCount: number
  classNames: string[]
  studentCount: number
  testStatus: TestStatus | 'none'
  testVersion: number | null
  /** Students of the attached classes who have handed the test in. */
  handedIn: number
}

export type RawAnswer = {
  studentProfileId: string
  studentName: string
  className: string
  questionId: string
  questionPosition: number
  prompt: string
  response: string
  /** null while the student has not handed in. */
  submittedAt: string | null
}

export type RawResults = {
  moduleId: string
  moduleTitle: string
  testId: string | null
  questions: Question[]
  students: { profileId: string; name: string; className: string; submittedAt: string | null }[]
  answers: RawAnswer[]
}

/** Errors the interface promises, so screens can show a sentence rather than a stack trace. */
export type PulseErrorCode =
  | 'NO_PROFILE' // the email has no pre-created profile (no self-enrollment)
  | 'BAD_CREDENTIALS'
  | 'ATTEMPT_CLOSED' // already handed in
  | 'ATTEMPT_EXISTS' // one attempt per student per test
  | 'TEST_NOT_AVAILABLE' // not published, closed, or not attached to this student's class
  | 'TIME_UP' // past the time limit (plus the two-minute grace)
  | 'ANSWER_TOO_LONG'
  | 'NOT_AUTHORISED'
  | 'UNKNOWN'

/** The longest answer the database accepts, mirrored here so the UI can warn first. */
export const MAX_ANSWER_LENGTH = 5000

export class PulseError extends Error {
  readonly code: PulseErrorCode

  constructor(code: PulseErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'PulseError'
  }
}

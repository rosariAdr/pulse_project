import type { SupabaseClient } from '@supabase/supabase-js'
import type { PulseRepo } from './repo'
import {
  PulseError,
  type Attempt,
  type Question,
  type RawAnswer,
  type RawResults,
  type StudentModule,
  type TeacherModule,
  type NewQuestion,
  type TestForStudent,
  type TestForTeacher,
  type TestStatus,
  type Viewer,
} from './types'

/**
 * The real implementation: the Supabase client plus Row Level Security, no
 * serverless functions. Every isolation rule is the database's, not this file's
 * — this only reads and writes, and turns database errors into PulseError codes
 * the screens can show.
 *
 * Known interim: saveAnswer does a read-then-write because the uniqueness
 * guarantees on `answers` are partial indexes, which PostgREST's upsert cannot
 * use as a conflict target. The board card "save_answer RPC" replaces it with a
 * single call; the interface does not change when it does.
 */

type Row = Record<string, unknown>

/** PostgREST's `max_rows` (supabase/config.toml, and the hosted default). */
const ANSWER_PAGE = 1000

type AttemptRow = { id: string; test_id: string; student_profile_id: string; started_at: string; submitted_at: string | null }
type TestRow = { id: string; module_id: string; version: number; status: TestStatus; time_limit_minutes: number }
type QuestionRow = { id: string; position: number; kind: Question['kind']; prompt: string; options: string[] | null; skill: string | null }

const toAttempt = (r: AttemptRow): Attempt => ({
  id: r.id,
  testId: r.test_id,
  studentProfileId: r.student_profile_id,
  startedAt: r.started_at,
  submittedAt: r.submitted_at,
})

const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  position: r.position,
  kind: r.kind,
  prompt: r.prompt,
  options: r.options,
  skill: r.skill,
})

/** What supabase-js hands back: a PostgREST error, or an AuthError with an HTTP status. */
type SupabaseFailure = { message?: string; code?: string; status?: number; name?: string }

/**
 * The request never reached Supabase, or came back without an answer. PostgREST
 * passes on the browser's own words, which differ per engine (Chrome, Firefox,
 * Safari, Node), or an AbortError on a timeout.
 *
 * Auth files more than cuts under AuthRetryableFetchError: auth-js puts every
 * 5xx there too (lib/fetch.js, NETWORK_ERROR_CODES), including the HTTP 500
 * "Database error saving new user" that the PULSE_NO_PROFILE trigger causes.
 * Only status 0 (fetch itself failed) and a gateway's 502 and above mean the
 * project could not be reached; a 500 or 501 is Supabase answering.
 */
function isCut(error: SupabaseFailure | null): boolean {
  if (!error) return false
  if (error.name === 'AuthRetryableFetchError') {
    const status = error.status ?? 0
    return status === 0 || status >= 502
  }
  return /failed to fetch|fetch failed|networkerror|load failed|network request failed|aborterror/i.test(
    error.message ?? '',
  )
}

/** Supabase Auth counts sign-ins and emails per IP address: one school wifi, many phones. */
function isRateLimited(error: SupabaseFailure | null): boolean {
  if (!error) return false
  return error.status === 429 || error.code?.startsWith('over_') === true || /rate limit/i.test(error.message ?? '')
}

/** Maps what the database says into something a screen can put in front of a student. */
function fail(error: SupabaseFailure | null, fallback: PulseError): never {
  const message = error?.message ?? ''
  const says = (marker: string) => message.includes(marker)

  if (isCut(error)) throw new PulseError('OFFLINE')
  if (isRateLimited(error)) throw new PulseError('RATE_LIMITED')
  if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    throw new PulseError('EMAIL_NOT_CONFIRMED')
  }
  if (says('PULSE_NO_PROFILE')) throw new PulseError('NO_PROFILE')
  if (says('PULSE_ATTEMPT_CLOSED')) throw new PulseError('ATTEMPT_CLOSED')
  if (says('PULSE_TIME_UP')) throw new PulseError('TIME_UP')
  if (says('PULSE_ANSWER_TOO_LONG')) throw new PulseError('ANSWER_TOO_LONG')
  if (says('PULSE_TEST_CLOSED')) throw new PulseError('TEST_NOT_AVAILABLE')
  if (says('PULSE_NOT_YOURS') || says('PULSE_WRONG_QUESTION') || says('PULSE_ANSWER_RETARGET')) {
    throw new PulseError('NOT_AUTHORISED')
  }
  if (error?.code === '23505') throw new PulseError('ATTEMPT_EXISTS')
  if (error?.code === '42501') throw new PulseError('NOT_AUTHORISED')
  if (error?.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    throw new PulseError('BAD_CREDENTIALS')
  }
  throw fallback
}

/** Options exist exactly for a multiple choice — the database holds the same check. */
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

export function createSupabaseRepo(client: SupabaseClient): PulseRepo {
  /** Builds the teacher's view of a test, including its questions and hand-ins. */
  async function teacherTest(test: TestRow, moduleTitle: string): Promise<TestForTeacher> {
    const { data: questionRows } = await client
      .from('test_questions')
      .select('id, position, kind, prompt, options, skill')
      .eq('test_id', test.id)
      .order('position')

    const { count } = await client
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('test_id', test.id)
      .not('submitted_at', 'is', null)

    return {
      id: test.id,
      moduleId: test.module_id,
      moduleTitle,
      version: test.version,
      status: test.status,
      timeLimitMinutes: test.time_limit_minutes,
      questions: ((questionRows ?? []) as QuestionRow[]).map(toQuestion),
      handedIn: count ?? 0,
    }
  }

  /** Who is signed in, resolved from the tables rather than from the token. */
  async function viewer(): Promise<Viewer | null> {
    const { data: auth, error: authError } = await client.auth.getUser()
    // Nobody signed in is an answer; a cut or a rate limit is not, and must not
    // read as "you cannot do that" in the middle of a test.
    if (isCut(authError) || isRateLimited(authError)) fail(authError, new PulseError('UNKNOWN'))
    const user = auth.user
    if (!user) return null

    const { data: staff, error: staffError } = await client
      .from('staff_accounts')
      .select('id, display_name, email')
      .eq('user_id', user.id)
      .maybeSingle()
    if (staffError) fail(staffError, new PulseError('UNKNOWN'))

    if (staff) {
      const s = staff as Row
      return { kind: 'master', id: s.id as string, name: s.display_name as string, email: s.email as string }
    }

    const { data: profiles, error: profileError } = await client
      .from('student_profiles')
      .select('id, full_name, email')
      .eq('user_id', user.id)
    if (profileError) fail(profileError, new PulseError('UNKNOWN'))

    const rows = (profiles ?? []) as Row[]
    if (rows.length === 0) return null
    return {
      kind: 'student',
      id: rows[0].id as string,
      name: rows[0].full_name as string,
      email: rows[0].email as string,
      profileIds: rows.map((r) => r.id as string),
    }
  }

  /**
   * Every answer of these attempts. PostgREST sends at most `max_rows` rows per
   * read (1 000) and says nothing about the rest, so this reads page by page,
   * moving on by what actually arrived, and checks the total against an exact
   * count: raw results and their CSV are never quietly short.
   */
  async function everyAnswerOf(attemptIds: string[]): Promise<Row[]> {
    const rows: Row[] = []
    let expected: number | null = null
    for (;;) {
      const { data, error, count } = await client
        .from('answers')
        .select('attempt_id, question_id, response', { count: 'exact' })
        .in('attempt_id', attemptIds)
        .order('id')
        .range(rows.length, rows.length + ANSWER_PAGE - 1)
      if (error) fail(error, new PulseError('UNKNOWN'))
      expected ??= count
      const page = (data ?? []) as Row[]
      rows.push(...page)
      if (page.length === 0 || expected === null || rows.length >= expected) break
    }
    if (rows.length !== expected) {
      throw new PulseError('UNKNOWN', `Read ${rows.length} answers where the database counts ${expected ?? 'none'}.`)
    }
    return rows
  }

  async function requireStudent() {
    const v = await viewer()
    if (!v || v.kind !== 'student') throw new PulseError('NOT_AUTHORISED')
    return v
  }

  async function requireMaster() {
    const v = await viewer()
    if (!v || v.kind !== 'master') throw new PulseError('NOT_AUTHORISED')
    return v
  }

  /** The student's profile in the class this module is attached to, if any. */
  async function profileForModule(moduleId: string): Promise<{ id: string; className: string } | null> {
    const { data, error } = await client
      .from('student_profiles')
      .select('id, classes!inner(name, class_modules!inner(module_id))')
      .eq('classes.class_modules.module_id', moduleId)
      .maybeSingle()
    // Two profiles on the same module (a provisioning run twice) make this fail:
    // say so, rather than hide the module as if it were not the student's.
    if (error) fail(error, new PulseError('UNKNOWN'))
    if (!data) return null
    const row = data as Row
    const klass = row.classes as { name: string } | { name: string }[]
    return { id: row.id as string, className: Array.isArray(klass) ? klass[0].name : klass.name }
  }

  async function publishedTest(moduleId: string) {
    const { data, error } = await client
      .from('tests')
      .select('id, time_limit_minutes')
      .eq('module_id', moduleId)
      .eq('status', 'published')
      .maybeSingle()
    // A cut is not "no test": the student must be told to retry, not that it is closed.
    if (error) fail(error, new PulseError('UNKNOWN'))
    return data as { id: string; time_limit_minutes: number } | null
  }

  async function attemptFor(testId: string, profileId: string): Promise<Attempt | null> {
    const { data, error } = await client
      .from('attempts')
      .select('id, test_id, student_profile_id, started_at, submitted_at')
      .eq('test_id', testId)
      .eq('student_profile_id', profileId)
      .maybeSingle()
    if (error) fail(error, new PulseError('UNKNOWN'))
    return data ? toAttempt(data as AttemptRow) : null
  }

  async function studentModuleOf(moduleId: string): Promise<StudentModule | null> {
    const profile = await profileForModule(moduleId)
    if (!profile) return null

    const { data: mod } = await client
      .from('modules')
      .select('id, code, title, language')
      .eq('id', moduleId)
      .maybeSingle()
    if (!mod) return null
    const m = mod as Row

    const test = await publishedTest(moduleId)
    const attempt = test ? await attemptFor(test.id, profile.id) : null

    return {
      id: m.id as string,
      code: (m.code as string | null) ?? null,
      title: m.title as string,
      language: m.language as string,
      className: profile.className,
      testId: test?.id ?? null,
      testStatus: !test ? 'none' : !attempt ? 'not-started' : attempt.submittedAt ? 'handed-in' : 'in-progress',
    }
  }

  return {
    auth: {
      current: viewer,

      async signIn(email, password) {
        const { error } = await client.auth.signInWithPassword({ email, password })
        // A wrong password is recognised by name in fail(); anything else is not one.
        if (error) fail(error, new PulseError('UNKNOWN'))
        const v = await viewer()
        if (!v) throw new PulseError('NO_PROFILE')
        return v
      },

      async claimProfile(email, password) {
        // The database trigger refuses any email without a pre-created profile.
        const { data, error } = await client.auth.signUp({ email, password })
        if (error) fail(error, new PulseError('NO_PROFILE'))
        // Email confirmation is on (both projects): the account exists, but the
        // session only follows once the student opens the link. A state, not a failure.
        if (!data.session) throw new PulseError('CHECK_INBOX')
        const v = await viewer()
        if (!v) throw new PulseError('UNKNOWN')
        return v
      },

      async requestPasswordReset(email) {
        // Errors are swallowed on purpose: never reveal whether an email exists.
        await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${globalThis.location?.origin ?? ''}/reset-password`,
        })
      },

      async updatePassword(password) {
        // The reset link signs the person in with a recovery session; without
        // one, Supabase answers "Auth session missing".
        const { error } = await client.auth.updateUser({ password })
        if (!error) return
        if (/session/i.test(error.message)) throw new PulseError('RESET_LINK_INVALID')
        fail(error, new PulseError('UNKNOWN'))
      },

      async signOut() {
        await client.auth.signOut()
      },
    },

    student: {
      async modules() {
        const v = await requireStudent()
        // A failed read of the classes must not look like a student with no module.
        const { data: classRows, error: classError } = await client
          .from('student_profiles')
          .select('class_id')
          .in('id', v.profileIds)
        if (classError) fail(classError, new PulseError('UNKNOWN'))
        const { data, error } = await client
          .from('class_modules')
          .select('module_id, student_profiles:classes!inner(id)')
          .in(
            'class_id',
            ((classRows ?? []) as Row[]).map((r) => r.class_id as string),
          )
        if (error) fail(error, new PulseError('UNKNOWN'))

        const ids = ((data ?? []) as Row[]).map((r) => r.module_id as string)
        const modules = await Promise.all(ids.map((id) => studentModuleOf(id)))
        return modules.filter((m): m is StudentModule => m !== null)
      },

      async module(moduleId) {
        await requireStudent()
        return studentModuleOf(moduleId)
      },

      async test(moduleId) {
        await requireStudent()
        const profile = await profileForModule(moduleId)
        const test = await publishedTest(moduleId)
        if (!profile || !test) return null

        const { data: mod } = await client.from('modules').select('title').eq('id', moduleId).maybeSingle()
        const { data: questionRows } = await client
          .from('test_questions')
          .select('id, position, kind, prompt, options, skill')
          .eq('test_id', test.id)
          .order('position')

        const attempt = await attemptFor(test.id, profile.id)
        const answers: Record<string, string> = {}
        if (attempt) {
          const { data: answerRows } = await client
            .from('answers')
            .select('question_id, response')
            .eq('attempt_id', attempt.id)
          for (const row of (answerRows ?? []) as Row[]) {
            answers[row.question_id as string] = row.response as string
          }
        }

        return {
          testId: test.id,
          moduleId,
          moduleTitle: ((mod as Row | null)?.title as string) ?? '',
          timeLimitMinutes: test.time_limit_minutes,
          questions: ((questionRows ?? []) as QuestionRow[]).map(toQuestion),
          attempt,
          answers,
        } satisfies TestForStudent
      },

      async startAttempt(moduleId) {
        await requireStudent()
        const profile = await profileForModule(moduleId)
        const test = await publishedTest(moduleId)
        if (!profile || !test) throw new PulseError('TEST_NOT_AVAILABLE')

        const { data, error } = await client
          .from('attempts')
          .insert({ test_id: test.id, student_profile_id: profile.id })
          .select('id, test_id, student_profile_id, started_at, submitted_at')
          .single()
        if (error) fail(error, new PulseError('TEST_NOT_AVAILABLE'))
        return toAttempt(data as AttemptRow)
      },

      async saveAnswer(attemptId, questionId, response) {
        await requireStudent()
        // One call: the function checks ownership, the open attempt, the time
        // limit and that the question belongs to the test, and raises a named
        // error rather than quietly saving nothing.
        const { error } = await client.rpc('save_answer', {
          p_attempt_id: attemptId,
          p_question_id: questionId,
          p_response: response,
        })
        if (error) fail(error, new PulseError('UNKNOWN'))
      },

      async handIn(attemptId) {
        await requireStudent()
        // submitted_at comes from the server's clock, inside the function.
        const { data, error } = await client.rpc('hand_in_attempt', { p_attempt_id: attemptId })
        // "Already handed in" only when the database says so (PULSE_ATTEMPT_CLOSED):
        // after a cut the test is still open, and the student must try again.
        if (error) fail(error, new PulseError('UNKNOWN'))

        const { data: row } = await client
          .from('attempts')
          .select('id, test_id, student_profile_id, started_at, submitted_at')
          .eq('id', attemptId)
          .single()
        if (row) return toAttempt(row as AttemptRow)

        // Fall back to what the function returned, so the screen can still move on.
        return {
          id: attemptId,
          testId: '',
          studentProfileId: '',
          startedAt: '',
          submittedAt: data as string,
        }
      },
    },

    teacher: {
      async modules() {
        await requireMaster()
        const { data, error } = await client
          .from('modules')
          .select(
            'id, code, title, language, session_count, class_modules(classes(id, name, student_profiles(id))), tests(id, status, version)',
          )
          .order('title')
        if (error) fail(error, new PulseError('UNKNOWN'))

        const out: TeacherModule[] = []
        for (const row of (data ?? []) as Row[]) {
          const links = (row.class_modules ?? []) as { classes: { name: string; student_profiles: unknown[] } }[]
          const tests = (row.tests ?? []) as { id: string; status: TeacherModule['testStatus']; version: number }[]
          const test = tests.find((t) => t.status === 'published') ?? tests[0] ?? null

          let handedIn = 0
          if (test) {
            const { count } = await client
              .from('attempts')
              .select('id', { count: 'exact', head: true })
              .eq('test_id', test.id)
              .not('submitted_at', 'is', null)
            handedIn = count ?? 0
          }

          out.push({
            id: row.id as string,
            code: (row.code as string | null) ?? null,
            title: row.title as string,
            language: row.language as string,
            sessionCount: row.session_count as number,
            classNames: links.map((l) => l.classes.name),
            studentCount: links.reduce((n, l) => n + l.classes.student_profiles.length, 0),
            testStatus: test?.status ?? 'none',
            testVersion: test?.version ?? null,
            handedIn,
          })
        }
        return out
      },

      async test(moduleId) {
        await requireMaster()
        const { data: mod } = await client.from('modules').select('title').eq('id', moduleId).maybeSingle()
        if (!mod) throw new PulseError('NOT_AUTHORISED')

        const { data: rows, error } = await client
          .from('tests')
          .select('id, module_id, version, status, time_limit_minutes')
          .eq('module_id', moduleId)
          .order('version', { ascending: false })
        if (error) fail(error, new PulseError('UNKNOWN'))

        const tests = (rows ?? []) as TestRow[]
        // The draft being written wins; otherwise what the class can see.
        const test = tests.find((t) => t.status === 'draft') ?? tests.find((t) => t.status === 'published')
        return test ? teacherTest(test, (mod as Row).title as string) : null
      },

      async createDraft(moduleId) {
        await requireMaster()
        const { data: mod } = await client.from('modules').select('title').eq('id', moduleId).maybeSingle()
        if (!mod) throw new PulseError('NOT_AUTHORISED')

        const { data: rows } = await client
          .from('tests')
          .select('id, module_id, version, status, time_limit_minutes')
          .eq('module_id', moduleId)
        const existing = (rows ?? []) as TestRow[]
        if (existing.some((t) => t.status === 'draft')) throw new PulseError('TEST_ALREADY_DRAFTED')

        const { data, error } = await client
          .from('tests')
          .insert({
            module_id: moduleId,
            version: Math.max(0, ...existing.map((t) => t.version)) + 1,
            status: 'draft',
          })
          .select('id, module_id, version, status, time_limit_minutes')
          .single()
        if (error) fail(error, new PulseError('UNKNOWN'))
        return teacherTest(data as TestRow, (mod as Row).title as string)
      },

      async addQuestion(testId, question) {
        await requireMaster()
        const checked = checkedQuestion(question)
        const { count } = await client
          .from('test_questions')
          .select('id', { count: 'exact', head: true })
          .eq('test_id', testId)

        const { data, error } = await client
          .from('test_questions')
          .insert({
            test_id: testId,
            position: (count ?? 0) + 1,
            kind: checked.kind,
            prompt: checked.prompt,
            options: checked.options,
            skill: checked.skill,
          })
          .select('id, position, kind, prompt, options, skill')
          .single()
        if (error) fail(error, new PulseError('TEST_FROZEN'))
        return toQuestion(data as QuestionRow)
      },

      async updateQuestion(questionId, question) {
        await requireMaster()
        const checked = checkedQuestion(question)
        const { data, error } = await client
          .from('test_questions')
          .update({
            kind: checked.kind,
            prompt: checked.prompt,
            options: checked.options,
            skill: checked.skill,
          })
          .eq('id', questionId)
          .select('id, position, kind, prompt, options, skill')
          .single()
        if (error) fail(error, new PulseError('TEST_FROZEN'))
        return toQuestion(data as QuestionRow)
      },

      async removeQuestion(questionId) {
        await requireMaster()
        const { error } = await client.from('test_questions').delete().eq('id', questionId)
        if (error) fail(error, new PulseError('TEST_FROZEN'))
      },

      async publish(testId) {
        await requireMaster()
        const { count } = await client
          .from('test_questions')
          .select('id', { count: 'exact', head: true })
          .eq('test_id', testId)
        if ((count ?? 0) === 0) throw new PulseError('TEST_EMPTY')

        const { data: draft } = await client.from('tests').select('module_id').eq('id', testId).maybeSingle()
        const moduleId = (draft as Row | null)?.module_id as string | undefined

        // One published test per module (the database holds a partial unique
        // index on it): the previous version closes before this one opens.
        if (moduleId) {
          await client
            .from('tests')
            .update({ status: 'closed' })
            .eq('module_id', moduleId)
            .eq('status', 'published')
        }

        const { error } = await client.from('tests').update({ status: 'published' }).eq('id', testId)
        if (error) fail(error, new PulseError('TEST_FROZEN'))
      },

      async rawResults(moduleId, requested) {
        await requireMaster()

        const { data: mod } = await client.from('modules').select('id, title').eq('id', moduleId).maybeSingle()
        if (!mod) throw new PulseError('NOT_AUTHORISED')

        // A draft has no answers: it never stands in for the version the class took.
        const { data: versionRows, error: versionError } = await client
          .from('tests')
          .select('id, status, version')
          .eq('module_id', moduleId)
          .neq('status', 'draft')
          .order('version', { ascending: false })
        if (versionError) fail(versionError, new PulseError('UNKNOWN'))
        const versions = (versionRows ?? []) as Pick<TestRow, 'id' | 'status' | 'version'>[]
        const chosen = requested
          ? versions.find((t) => t.id === requested)
          : (versions.find((t) => t.status === 'published') ?? versions[0])
        if (requested && !chosen) throw new PulseError('TEST_NOT_AVAILABLE')
        const testId = chosen?.id

        const { data: questionRows } = testId
          ? await client
              .from('test_questions')
              .select('id, position, kind, prompt, options, skill')
              .eq('test_id', testId)
              .order('position')
          : { data: [] }
        const questions = ((questionRows ?? []) as QuestionRow[]).map(toQuestion)

        const { data: profileRows } = await client
          .from('student_profiles')
          .select('id, full_name, classes!inner(name, class_modules!inner(module_id))')
          .eq('classes.class_modules.module_id', moduleId)
          .order('full_name')

        const profiles = ((profileRows ?? []) as Row[]).map((r) => {
          const klass = r.classes as { name: string } | { name: string }[]
          return {
            profileId: r.id as string,
            name: r.full_name as string,
            className: Array.isArray(klass) ? klass[0].name : klass.name,
          }
        })

        const attempts = testId
          ? (
              (
                await client
                  .from('attempts')
                  .select('id, test_id, student_profile_id, started_at, submitted_at')
                  .eq('test_id', testId)
              ).data ?? []
            ).map((r) => toAttempt(r as AttemptRow))
          : []

        const answerRows = attempts.length ? await everyAnswerOf(attempts.map((a) => a.id)) : []
        const responseOf = new Map(answerRows.map((r) => [`${r.attempt_id}|${r.question_id}`, r.response as string]))

        const answers: RawAnswer[] = []
        for (const attempt of attempts) {
          const profile = profiles.find((p) => p.profileId === attempt.studentProfileId)
          if (!profile) continue
          for (const question of questions) {
            answers.push({
              studentProfileId: profile.profileId,
              studentName: profile.name,
              className: profile.className,
              questionId: question.id,
              questionPosition: question.position,
              prompt: question.prompt,
              response: responseOf.get(`${attempt.id}|${question.id}`) ?? '',
              submittedAt: attempt.submittedAt,
            })
          }
        }

        return {
          moduleId,
          moduleTitle: (mod as Row).title as string,
          testId: testId ?? null,
          questions,
          students: profiles.map((p) => ({
            ...p,
            submittedAt: attempts.find((a) => a.studentProfileId === p.profileId)?.submittedAt ?? null,
          })),
          answers,
        } satisfies RawResults
      },
    },
  }
}

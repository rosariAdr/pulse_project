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
  type TestForStudent,
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

type AttemptRow = { id: string; test_id: string; student_profile_id: string; started_at: string; submitted_at: string | null }
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

/** Maps what the database says into something a screen can put in front of a student. */
function fail(error: { message?: string; code?: string } | null, fallback: PulseError): never {
  const message = error?.message ?? ''
  if (message.includes('PULSE_NO_PROFILE')) throw new PulseError('NO_PROFILE')
  if (message.includes('PULSE_ATTEMPT_CLOSED')) throw new PulseError('ATTEMPT_CLOSED')
  if (error?.code === '23505') throw new PulseError('ATTEMPT_EXISTS')
  if (error?.code === '42501') throw new PulseError('NOT_AUTHORISED')
  if (message.toLowerCase().includes('invalid login credentials')) throw new PulseError('BAD_CREDENTIALS')
  throw fallback
}

export function createSupabaseRepo(client: SupabaseClient): PulseRepo {
  /** Who is signed in, resolved from the tables rather than from the token. */
  async function viewer(): Promise<Viewer | null> {
    const { data: auth } = await client.auth.getUser()
    const user = auth.user
    if (!user) return null

    const { data: staff } = await client
      .from('staff_accounts')
      .select('id, display_name, email')
      .eq('user_id', user.id)
      .maybeSingle()

    if (staff) {
      const s = staff as Row
      return { kind: 'master', id: s.id as string, name: s.display_name as string, email: s.email as string }
    }

    const { data: profiles } = await client
      .from('student_profiles')
      .select('id, full_name, email')
      .eq('user_id', user.id)

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
    const { data } = await client
      .from('student_profiles')
      .select('id, classes!inner(name, class_modules!inner(module_id))')
      .eq('classes.class_modules.module_id', moduleId)
      .maybeSingle()
    if (!data) return null
    const row = data as Row
    const klass = row.classes as { name: string } | { name: string }[]
    return { id: row.id as string, className: Array.isArray(klass) ? klass[0].name : klass.name }
  }

  async function publishedTest(moduleId: string) {
    const { data } = await client
      .from('tests')
      .select('id, time_limit_minutes')
      .eq('module_id', moduleId)
      .eq('status', 'published')
      .maybeSingle()
    return data as { id: string; time_limit_minutes: number } | null
  }

  async function attemptFor(testId: string, profileId: string): Promise<Attempt | null> {
    const { data } = await client
      .from('attempts')
      .select('id, test_id, student_profile_id, started_at, submitted_at')
      .eq('test_id', testId)
      .eq('student_profile_id', profileId)
      .maybeSingle()
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
        if (error) fail(error, new PulseError('BAD_CREDENTIALS'))
        const v = await viewer()
        if (!v) throw new PulseError('NO_PROFILE')
        return v
      },

      async claimProfile(email, password) {
        // The database trigger refuses any email without a pre-created profile.
        const { error } = await client.auth.signUp({ email, password })
        if (error) fail(error, new PulseError('NO_PROFILE'))
        const v = await viewer()
        if (!v) {
          // Email confirmation is on: the account exists but no session yet.
          throw new PulseError('UNKNOWN', 'Check your inbox to confirm your address, then sign in.')
        }
        return v
      },

      async requestPasswordReset(email) {
        // Errors are swallowed on purpose: never reveal whether an email exists.
        await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${globalThis.location?.origin ?? ''}/reset-password`,
        })
      },

      async signOut() {
        await client.auth.signOut()
      },
    },

    student: {
      async modules() {
        const v = await requireStudent()
        const { data, error } = await client
          .from('class_modules')
          .select('module_id, student_profiles:classes!inner(id)')
          .in(
            'class_id',
            (
              await client.from('student_profiles').select('class_id').in('id', v.profileIds)
            ).data?.map((r) => (r as Row).class_id as string) ?? [],
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
        const v = await requireStudent()

        const { data: existing } = await client
          .from('answers')
          .select('id')
          .eq('attempt_id', attemptId)
          .eq('question_id', questionId)
          .maybeSingle()

        if (existing) {
          const { data, error } = await client
            .from('answers')
            .update({ response })
            .eq('id', (existing as Row).id as string)
            .select('id')
          if (error) fail(error, new PulseError('UNKNOWN'))
          // RLS filters the row rather than raising: no row back means the attempt is closed.
          if (!data || data.length === 0) throw new PulseError('ATTEMPT_CLOSED')
          return
        }

        const { data, error } = await client
          .from('answers')
          .insert({
            attempt_id: attemptId,
            question_id: questionId,
            student_profile_id: v.profileIds[0],
            response,
          })
          .select('id')
        if (error) fail(error, new PulseError('ATTEMPT_CLOSED'))
        if (!data || data.length === 0) throw new PulseError('ATTEMPT_CLOSED')
      },

      async handIn(attemptId) {
        await requireStudent()
        // submitted_at is stamped by the server's clock in a trigger; the value sent is ignored.
        const { data, error } = await client
          .from('attempts')
          .update({ submitted_at: new Date().toISOString() })
          .eq('id', attemptId)
          .is('submitted_at', null)
          .select('id, test_id, student_profile_id, started_at, submitted_at')
        if (error) fail(error, new PulseError('UNKNOWN'))
        if (!data || data.length === 0) throw new PulseError('ATTEMPT_CLOSED')
        return toAttempt(data[0] as AttemptRow)
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

      async rawResults(moduleId) {
        await requireMaster()

        const { data: mod } = await client.from('modules').select('id, title').eq('id', moduleId).maybeSingle()
        if (!mod) throw new PulseError('NOT_AUTHORISED')

        const { data: testRow } = await client
          .from('tests')
          .select('id')
          .eq('module_id', moduleId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle()
        const testId = (testRow as Row | null)?.id as string | undefined

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

        const answerRows = attempts.length
          ? ((
              await client
                .from('answers')
                .select('attempt_id, question_id, response')
                .in(
                  'attempt_id',
                  attempts.map((a) => a.id),
                )
            ).data ?? [])
          : []

        const answers: RawAnswer[] = []
        for (const attempt of attempts) {
          const profile = profiles.find((p) => p.profileId === attempt.studentProfileId)
          if (!profile) continue
          for (const question of questions) {
            const row = (answerRows as Row[]).find(
              (r) => r.attempt_id === attempt.id && r.question_id === question.id,
            )
            answers.push({
              studentProfileId: profile.profileId,
              studentName: profile.name,
              className: profile.className,
              questionId: question.id,
              questionPosition: question.position,
              prompt: question.prompt,
              response: (row?.response as string) ?? '',
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

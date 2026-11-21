import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseRepo } from './supabaseRepo'
import { PulseError } from './types'

/**
 * Raw results past PostgREST's page. The real server answers any read with at
 * most `max_rows` rows (1 000 in supabase/config.toml, and by default on the
 * hosted projects), whatever range was asked for, and says nothing about the
 * rest; `count: 'exact'` still counts them all.
 *
 * The client below is a stand-in that keeps exactly that rule, so the gate
 * proves the reading logic without Docker. The same scenario runs against a real
 * PostgREST in the repository contract (CI `database` job). All data fictional.
 */
const MAX_ROWS = 1000

type Row = Record<string, unknown>
type Answer = { data: unknown; error: { code: string; message: string } | null; count?: number | null }

function postgrestDouble(tables: Record<string, Row[]>, userId: string, options: { countDrift?: number } = {}) {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])]
    let counting = false
    let first = 0
    let last = Number.POSITIVE_INFINITY

    // What the server sends back: the requested window, cut at max_rows.
    const page = () => rows.slice(first, Math.min(last + 1, first + MAX_ROWS))

    const query = {
      select(_columns?: string, opts?: { count?: 'exact' }) {
        counting = opts?.count === 'exact'
        return query
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((r) => r[column] === value)
        return query
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((r) => values.includes(r[column]))
        return query
      },
      order(column: string, opts?: { ascending?: boolean }) {
        const direction = opts?.ascending === false ? -1 : 1
        rows.sort((a, b) => {
          const x = a[column] as string | number
          const y = b[column] as string | number
          return x < y ? -direction : x > y ? direction : 0
        })
        return query
      },
      limit(n: number) {
        last = first + n - 1
        return query
      },
      range(start: number, end: number) {
        first = start
        last = end
        return query
      },
      maybeSingle(): Promise<Answer> {
        const found = page()
        return Promise.resolve(
          found.length > 1
            ? { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple rows returned' } }
            : { data: found[0] ?? null, error: null },
        )
      },
      then<T>(resolve: (answer: Answer) => T, reject?: (reason: unknown) => T) {
        const count = counting ? rows.length + (options.countDrift ?? 0) : null
        return Promise.resolve<Answer>({ data: page(), error: null, count }).then(resolve, reject)
      },
    }
    return query
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from,
  } as unknown as SupabaseClient
}

/** One module shared by enough students and questions to pass 1 000 answers. */
function bigClass(students: number, questions: number) {
  const pad = (n: number) => String(n).padStart(5, '0')
  const tables: Record<string, Row[]> = {
    staff_accounts: [{ id: 'staff-1', user_id: 'user-master', display_name: 'Demo master', email: 'master@pulse.example' }],
    modules: [{ id: 'module-1', title: 'Module (fictional)' }],
    tests: [{ id: 'test-1', module_id: 'module-1', version: 1, status: 'published' }],
    test_questions: [],
    student_profiles: [],
    attempts: [],
    answers: [],
  }
  for (let q = 1; q <= questions; q++) {
    tables.test_questions.push({
      id: `question-${pad(q)}`,
      test_id: 'test-1',
      position: q,
      kind: 'short',
      prompt: `Question ${q}`,
      options: null,
      skill: null,
    })
  }
  for (let s = 1; s <= students; s++) {
    tables.student_profiles.push({
      id: `profile-${pad(s)}`,
      full_name: `Student ${pad(s)} (fictional)`,
      classes: { name: 'Class (fictional)' },
      // The embedded filter rawResults uses, flattened for the stand-in.
      'classes.class_modules.module_id': 'module-1',
    })
    tables.attempts.push({
      id: `attempt-${pad(s)}`,
      test_id: 'test-1',
      student_profile_id: `profile-${pad(s)}`,
      started_at: '2026-11-19T08:00:00Z',
      submitted_at: '2026-11-19T08:20:00Z',
    })
    for (let q = 1; q <= questions; q++) {
      tables.answers.push({
        id: `answer-${pad(s)}-${pad(q)}`,
        attempt_id: `attempt-${pad(s)}`,
        question_id: `question-${pad(q)}`,
        response: `Answer of student ${s} to question ${q}`,
      })
    }
  }
  return tables
}

describe('raw results past the 1 000-row page', () => {
  it('reads every answer when a module holds more than the server sends at once', async () => {
    const repo = createSupabaseRepo(postgrestDouble(bigClass(5, 201), 'user-master'))

    const raw = await repo.teacher.rawResults('module-1')

    expect(raw.answers).toHaveLength(5 * 201)
    expect(raw.answers.filter((a) => a.response === '')).toHaveLength(0)
    const last = raw.answers.find((a) => a.studentName === 'Student 00005 (fictional)' && a.questionPosition === 201)
    expect(last?.response).toBe('Answer of student 5 to question 201')
  })

  it('refuses to return results whose row count does not match what the server counted', async () => {
    // Rows written or removed between two pages: better a loud error than a
    // CSV that is quietly short.
    const repo = createSupabaseRepo(postgrestDouble(bigClass(5, 201), 'user-master', { countDrift: 2 }))

    const outcome = await repo.teacher.rawResults('module-1').then(
      () => 'no-error',
      (e: unknown) => (e instanceof PulseError ? e.code : 'not-a-pulse-error'),
    )
    expect(outcome).toBe('UNKNOWN')
  })
})

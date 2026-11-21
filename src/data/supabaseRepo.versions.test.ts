import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseRepo } from './supabaseRepo'
import { PulseError } from './types'

/**
 * Test versions in the raw results, and errors that used to be ignored (PU-07,
 * PU-03). The client is a stand-in for PostgREST over a few in-memory tables:
 * it filters, sorts and, like the real server, makes `maybeSingle()` fail when
 * more than one row matches. The same rules run against the local stack in the
 * repository contract (CI `database` job). All data fictional.
 */
type Row = Record<string, unknown>
type Answer = { data: unknown; error: { code: string; message: string } | null; count?: number | null }

function postgrestDouble(tables: Record<string, Row[]>, userId: string) {
  function from(table: string) {
    let rows = [...(tables[table] ?? [])]
    let counting = false
    let limit = Number.POSITIVE_INFINITY

    const query = {
      select(_columns?: string, opts?: { count?: 'exact'; head?: boolean }) {
        counting = opts?.count === 'exact'
        return query
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((r) => r[column] === value)
        return query
      },
      neq(column: string, value: unknown) {
        rows = rows.filter((r) => r[column] !== value)
        return query
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((r) => values.includes(r[column]))
        return query
      },
      not(column: string, _operator: 'is', value: null) {
        rows = rows.filter((r) => r[column] !== value)
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
        limit = n
        return query
      },
      range(start: number, end: number) {
        rows = rows.slice(start, end + 1)
        return query
      },
      maybeSingle(): Promise<Answer> {
        const found = rows.slice(0, limit)
        return Promise.resolve(
          found.length > 1
            ? { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple rows returned' } }
            : { data: found[0] ?? null, error: null },
        )
      },
      then<T>(resolve: (answer: Answer) => T, reject?: (reason: unknown) => T) {
        const all = rows.length
        return Promise.resolve<Answer>({ data: rows.slice(0, limit), error: null, count: counting ? all : null }).then(
          resolve,
          reject,
        )
      },
    }
    return query
  }

  return {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from,
  } as unknown as SupabaseClient
}

/** A module whose version 1 was handed in by one student, with version 2 being written. */
function moduleWithTwoVersions(version2: 'draft' | 'published') {
  return {
    staff_accounts: [{ id: 'staff-1', user_id: 'user-master', display_name: 'Demo master', email: 'master@pulse.example' }],
    modules: [{ id: 'module-1', title: 'Module (fictional)' }],
    tests: [
      { id: 'test-v1', module_id: 'module-1', version: 1, status: version2 === 'published' ? 'closed' : 'published' },
      { id: 'test-v2', module_id: 'module-1', version: 2, status: version2 },
    ],
    test_questions: [
      { id: 'q-v1', test_id: 'test-v1', position: 1, kind: 'short', prompt: 'Version 1, question 1', options: null, skill: null },
      { id: 'q-v2', test_id: 'test-v2', position: 1, kind: 'short', prompt: 'Version 2, question 1', options: null, skill: null },
    ],
    student_profiles: [
      {
        id: 'profile-1',
        full_name: 'Student One (fictional)',
        classes: { name: 'Class (fictional)' },
        'classes.class_modules.module_id': 'module-1',
      },
    ],
    attempts: [
      {
        id: 'attempt-1',
        test_id: 'test-v1',
        student_profile_id: 'profile-1',
        started_at: '2026-11-19T08:00:00Z',
        submitted_at: '2026-11-19T08:20:00Z',
      },
    ],
    answers: [{ id: 'answer-1', attempt_id: 'attempt-1', question_id: 'q-v1', response: 'Written in version 1' }],
  }
}

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 'no-error'
  } catch (e) {
    return e instanceof PulseError ? e.code : 'not-a-pulse-error'
  }
}

describe('raw results and test versions', () => {
  it('keeps reading the published version while the next one is a draft', async () => {
    const repo = createSupabaseRepo(postgrestDouble(moduleWithTwoVersions('draft'), 'user-master'))

    const raw = await repo.teacher.rawResults('module-1')

    expect(raw.testId).toBe('test-v1')
    expect(raw.answers.map((a) => a.response)).toEqual(['Written in version 1'])
  })

  it('refuses to read a draft, even when asked for it by name', async () => {
    const repo = createSupabaseRepo(postgrestDouble(moduleWithTwoVersions('draft'), 'user-master'))
    expect(await codeOf(() => repo.teacher.rawResults('module-1', 'test-v2'))).toBe('TEST_NOT_AVAILABLE')
  })

  it('reads the version asked for, closed ones included', async () => {
    const repo = createSupabaseRepo(postgrestDouble(moduleWithTwoVersions('published'), 'user-master'))

    expect((await repo.teacher.rawResults('module-1')).testId).toBe('test-v2')
    const earlier = await repo.teacher.rawResults('module-1', 'test-v1')
    expect(earlier.testId).toBe('test-v1')
    expect(earlier.answers.map((a) => a.response)).toEqual(['Written in version 1'])
  })

  it('refuses a version that belongs to another module', async () => {
    const tables = moduleWithTwoVersions('published')
    tables.tests.push({ id: 'test-other', module_id: 'module-2', version: 1, status: 'published' })
    const repo = createSupabaseRepo(postgrestDouble(tables, 'user-master'))
    expect(await codeOf(() => repo.teacher.rawResults('module-1', 'test-other'))).toBe('TEST_NOT_AVAILABLE')
  })
})

describe('a student whose profile the database cannot resolve', () => {
  it('says something went wrong rather than hiding the module', async () => {
    // Two profiles in two classes attached to the same module (a provisioning
    // run twice, PU-03): maybeSingle() fails, and that failure used to read as
    // "this module is not yours".
    const tables: Record<string, Row[]> = {
      staff_accounts: [],
      student_profiles: [
        { id: 'profile-a', user_id: 'user-student', full_name: 'Student (fictional)', email: 's@school.example', 'classes.class_modules.module_id': 'module-1', classes: { name: 'Class A' } },
        { id: 'profile-b', user_id: 'user-student', full_name: 'Student (fictional)', email: 's@school.example', 'classes.class_modules.module_id': 'module-1', classes: { name: 'Class B' } },
      ],
      modules: [{ id: 'module-1', code: 'M1', title: 'Module (fictional)', language: 'en' }],
      tests: [],
    }
    const repo = createSupabaseRepo(postgrestDouble(tables, 'user-student'))
    expect(await codeOf(() => repo.student.module('module-1'))).toBe('UNKNOWN')
  })
})

import { createClient } from '@supabase/supabase-js'
import { describe, expect, inject, it } from 'vitest'
import { describeRepoContract, SEED } from './contract/repoContract'
import { createSupabaseRepo } from './supabaseRepo'
import { PulseError } from './types'

// Local stack only: accounts are created from the seeded profiles on first use.
const PASSWORD = 'pulse-integration-only'

// B1 · Groupe 2 in supabase/seed.sql: five students.
const IDRAC_CLASS = '00000000-0000-4000-8000-0000000000c1'

function localStack() {
  const { url, key } = inject('supabase')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const repo = createSupabaseRepo(client)

  const actAs = async (email: string) => {
    await repo.auth.signOut()
    try {
      await repo.auth.signIn(email, PASSWORD)
    } catch (e) {
      if (!(e instanceof PulseError) || e.code !== 'BAD_CREDENTIALS') throw e
      await repo.auth.claimProfile(email, PASSWORD)
    }
  }

  return { client, repo, actAs }
}

describeRepoContract('supabase (local stack)', async () => {
  const { repo, actAs } = localStack()
  return { repo, actAs }
})

type DbAnswer = { data: unknown; error: { message: string } | null }

/** Stops the test on the database's own words rather than carrying on with nothing. */
async function written(request: PromiseLike<DbAnswer>): Promise<void> {
  const { error } = await request
  if (error) throw new Error(error.message)
}

/** Same, for a write or a read whose rows come back: no rows is a failure too. */
async function returned<T>(request: PromiseLike<DbAnswer>): Promise<T> {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('The database returned no rows.')
  return data as T
}

// Runs after the contract, in the same file, so the module it attaches to the
// demo class cannot change what the contract's students see.
describe.sequential('raw results past the 1 000-row page — supabase (local stack)', () => {
  it('reads every answer of a module that holds more than one page of them', async () => {
    const { client: db, repo, actAs } = localStack()
    await actAs(SEED.master)

    // The volume of a module shared by several groups: 5 students × 201
    // questions. Written straight in as the master account: through the
    // screens' calls it would take thousands of requests. All content fictional.
    const QUESTIONS = 201
    const mod = await returned<{ id: string }>(
      db.from('modules').insert({ code: 'BK', title: 'Bulk read (integration only)', language: 'en' }).select('id').single(),
    )
    await written(db.from('class_modules').insert({ class_id: IDRAC_CLASS, module_id: mod.id }))
    const test = await returned<{ id: string }>(db.from('tests').insert({ module_id: mod.id, version: 1 }).select('id').single())
    await written(
      db.from('test_questions').insert(
        Array.from({ length: QUESTIONS }, (_, i) => ({
          test_id: test.id,
          position: i + 1,
          kind: 'short',
          prompt: `Bulk question ${i + 1}`,
        })),
      ),
    )
    await written(db.from('tests').update({ status: 'published' }).eq('id', test.id))

    const profiles = await returned<{ id: string }[]>(db.from('student_profiles').select('id').eq('class_id', IDRAC_CLASS))
    const attempts = await returned<{ id: string; student_profile_id: string }[]>(
      db
        .from('attempts')
        .insert(profiles.map((p) => ({ test_id: test.id, student_profile_id: p.id })))
        .select('id, student_profile_id'),
    )
    const questions = await returned<{ id: string; position: number }[]>(
      db.from('test_questions').select('id, position').eq('test_id', test.id).order('position'),
    )
    await written(
      db.from('answers').insert(
        attempts.flatMap((a) =>
          questions.map((q) => ({
            student_profile_id: a.student_profile_id,
            attempt_id: a.id,
            question_id: q.id,
            response: `Answer ${q.position} of ${a.student_profile_id}`,
          })),
        ),
      ),
    )
    expect(attempts.length * QUESTIONS).toBeGreaterThan(1000)

    const raw = await repo.teacher.rawResults(mod.id)

    expect(raw.answers).toHaveLength(attempts.length * QUESTIONS)
    expect(raw.answers.filter((a) => a.response === '')).toHaveLength(0)
    const lastStudent = attempts.at(-1)!.student_profile_id
    const last = raw.answers.find((a) => a.studentProfileId === lastStudent && a.questionPosition === QUESTIONS)
    expect(last?.response).toBe(`Answer ${QUESTIONS} of ${lastStudent}`)
  }, 120_000)
})

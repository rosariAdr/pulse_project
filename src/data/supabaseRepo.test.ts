import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseRepo } from './supabaseRepo'
import { PulseError } from './types'

/**
 * Only the answers the local stack cannot give: email confirmation is off in
 * supabase/config.toml and on pulse-dev, and may be turned on in prod (decided
 * before the first class). The client is a stand-in for what Supabase Auth
 * returns when it is on. The rest of the Supabase repository is proven by the
 * integration layer (Task 6 of the v0-finish plan), not here.
 */
type SignUpAnswer = {
  data: { user: { id: string } | null; session: { access_token: string } | null }
  error: { message: string; status?: number } | null
}

function clientWhoseSignUpReturns(answer: SignUpAnswer) {
  return {
    auth: {
      signUp: async () => answer,
      // Without a session nobody is signed in.
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  } as unknown as SupabaseClient
}

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 'no-error'
  } catch (e) {
    return e instanceof PulseError ? e.code : 'not-a-pulse-error'
  }
}

describe('claiming a profile on a project with email confirmation on', () => {
  it('asks the student to check their inbox when the account exists but no session follows', async () => {
    const repo = createSupabaseRepo(
      clientWhoseSignUpReturns({ data: { user: { id: 'new-user' }, session: null }, error: null }),
    )

    expect(await codeOf(() => repo.auth.claimProfile('a.benkirane@idrac.example', 'a-good-password'))).toBe(
      'CHECK_INBOX',
    )
  })

  it('still says NO_PROFILE when the database refuses the email', async () => {
    // The PULSE_NO_PROFILE trigger surfaces through Auth as a generic message.
    const repo = createSupabaseRepo(
      clientWhoseSignUpReturns({
        data: { user: null, session: null },
        error: { message: 'Database error saving new user', status: 500 },
      }),
    )

    expect(await codeOf(() => repo.auth.claimProfile('stranger@nowhere.example', 'a-good-password'))).toBe(
      'NO_PROFILE',
    )
  })
})

/**
 * What a student reads when Supabase Auth or the network says no (PU-06). On
 * the test day, 25 phones share the school's IP address and its wifi: a rate
 * limit, an unconfirmed address or a cut must each say what to do, never "wrong
 * password", "no profile" or "already handed in". The errors below are the
 * ones supabase-js returns; the client around them is a stand-in.
 */
const STUDENT_ROW = { id: 'profile-1', full_name: 'Student (fictional)', email: 'student@school.example' }

type Returned = { data: unknown; error: unknown }

function clientThatAnswers(answers: {
  signIn?: Returned
  signUp?: Returned
  getUser?: Returned
  rpc?: Returned
  /** The read of this table that comes after `after` successful ones never reaches the server. */
  cutOn?: { table: string; after?: number }
}) {
  const reads: Record<string, number> = {}
  const table = (name: string, rows: unknown) => {
    reads[name] = (reads[name] ?? 0) + 1
    const cut = answers.cutOn?.table === name && reads[name] > (answers.cutOn.after ?? 0)
    const answer = cut ? databaseCut('TypeError: Failed to fetch') : { data: rows, error: null }
    const query = {
      select: () => query,
      eq: () => query,
      in: () => query,
      maybeSingle: async () => (cut ? answer : { data: null, error: null }),
      single: async () => (cut ? answer : { data: null, error: null }),
      then: (resolve: (r: Returned) => unknown) => Promise.resolve(answer).then(resolve),
    }
    return query
  }
  return {
    auth: {
      signInWithPassword: async () => answers.signIn ?? { data: { session: {} }, error: null },
      signUp: async () => answers.signUp ?? { data: { session: {} }, error: null },
      getUser: async () => answers.getUser ?? { data: { user: { id: 'user-1' } }, error: null },
    },
    // A signed-in student: no staff row, one profile.
    from: (name: string) => table(name, name === 'student_profiles' ? [STUDENT_ROW] : null),
    rpc: async () => answers.rpc ?? { data: '2026-11-19T09:20:00Z', error: null },
  } as unknown as SupabaseClient
}

const authRefusal = (message: string, status: number, code: string) => ({
  data: { user: null, session: null },
  error: new AuthApiError(message, status, code),
})
const authCut = { data: { user: null, session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) }
// How postgrest-js reports a request that never reached the server, per browser and Node.
const cutMessages = [
  'TypeError: Failed to fetch',
  'TypeError: NetworkError when attempting to fetch resource.',
  'TypeError: Load failed',
  'TypeError: fetch failed',
]
const databaseCut = (message: string) => ({ data: null, error: { message, details: '', hint: '', code: '' } })

describe('signing in when Supabase Auth refuses', () => {
  it('asks to open the confirmation link when the address is not confirmed yet', async () => {
    const repo = createSupabaseRepo(
      clientThatAnswers({ signIn: authRefusal('Email not confirmed', 400, 'email_not_confirmed') }),
    )
    expect(await codeOf(() => repo.auth.signIn('student@school.example', 'a-good-password'))).toBe(
      'EMAIL_NOT_CONFIRMED',
    )
  })

  it('asks to wait when too many sign-ins come from the same network', async () => {
    const repo = createSupabaseRepo(
      clientThatAnswers({ signIn: authRefusal('Request rate limit reached', 429, 'over_request_rate_limit') }),
    )
    expect(await codeOf(() => repo.auth.signIn('student@school.example', 'a-good-password'))).toBe('RATE_LIMITED')
  })

  it('says the connection failed when the request never reached Supabase', async () => {
    const repo = createSupabaseRepo(clientThatAnswers({ signIn: authCut }))
    expect(await codeOf(() => repo.auth.signIn('student@school.example', 'a-good-password'))).toBe('OFFLINE')
  })

  it('still says the email and password do not match when they do not', async () => {
    const repo = createSupabaseRepo(
      clientThatAnswers({ signIn: authRefusal('Invalid login credentials', 400, 'invalid_credentials') }),
    )
    expect(await codeOf(() => repo.auth.signIn('student@school.example', 'a-wrong-password'))).toBe(
      'BAD_CREDENTIALS',
    )
  })

  it('does not blame the password for an error it cannot read', async () => {
    const repo = createSupabaseRepo(
      clientThatAnswers({ signIn: authRefusal('Database error querying schema', 500, 'unexpected_failure') }),
    )
    expect(await codeOf(() => repo.auth.signIn('student@school.example', 'a-good-password'))).toBe('UNKNOWN')
  })
})

describe('creating the password when Supabase Auth refuses', () => {
  it('asks to wait rather than saying the profile does not exist', async () => {
    const repo = createSupabaseRepo(
      clientThatAnswers({ signUp: authRefusal('Email rate limit exceeded', 429, 'over_email_send_rate_limit') }),
    )
    expect(await codeOf(() => repo.auth.claimProfile('student@school.example', 'a-good-password'))).toBe(
      'RATE_LIMITED',
    )
  })

  it('says the connection failed rather than saying the profile does not exist', async () => {
    const repo = createSupabaseRepo(clientThatAnswers({ signUp: authCut }))
    expect(await codeOf(() => repo.auth.claimProfile('student@school.example', 'a-good-password'))).toBe('OFFLINE')
  })
})

describe('the test day, when the connection drops', () => {
  it.each(cutMessages)('says a hand-in did not go through on a cut (%s)', async (message) => {
    const repo = createSupabaseRepo(clientThatAnswers({ rpc: databaseCut(message) }))
    expect(await codeOf(() => repo.student.handIn('attempt-1'))).toBe('OFFLINE')
  })

  it('does not call an error it cannot read "already handed in"', async () => {
    const repo = createSupabaseRepo(
      clientThatAnswers({ rpc: { data: null, error: { message: 'PULSE_NOT_FOUND: no such attempt', code: 'P0001' } } }),
    )
    expect(await codeOf(() => repo.student.handIn('attempt-1'))).toBe('UNKNOWN')
  })

  it('still says "already handed in" when the database says so', async () => {
    const closed = { message: 'PULSE_ATTEMPT_CLOSED: you have already handed this test in', code: 'P0001' }
    const repo = createSupabaseRepo(clientThatAnswers({ rpc: { data: null, error: closed } }))
    expect(await codeOf(() => repo.student.handIn('attempt-1'))).toBe('ATTEMPT_CLOSED')
  })

  it('says the connection failed when the cut comes while checking who is signed in', async () => {
    const repo = createSupabaseRepo(clientThatAnswers({ getUser: authCut }))
    expect(await codeOf(() => repo.student.handIn('attempt-1'))).toBe('OFFLINE')
  })

  it.each(cutMessages)('tells a failed save from a refusal on a cut (%s)', async (message) => {
    const repo = createSupabaseRepo(clientThatAnswers({ rpc: databaseCut(message) }))
    expect(await codeOf(() => repo.student.saveAnswer('attempt-1', 'question-1', 'An answer'))).toBe('OFFLINE')
  })

  it('says the connection failed rather than "this test is not open"', async () => {
    const repo = createSupabaseRepo(clientThatAnswers({ cutOn: { table: 'tests' } }))
    expect(await codeOf(() => repo.student.test('module-1'))).toBe('OFFLINE')
  })

  it('says the connection failed rather than showing no module at all', async () => {
    // The first read of the profiles is who is signed in; the second, their classes.
    const repo = createSupabaseRepo(clientThatAnswers({ cutOn: { table: 'student_profiles', after: 1 } }))
    expect(await codeOf(() => repo.student.modules())).toBe('OFFLINE')
  })

  it('still treats nobody signed in as nobody signed in', async () => {
    const signedOut = { data: { user: null }, error: new AuthSessionMissingError() }
    const repo = createSupabaseRepo(clientThatAnswers({ getUser: signedOut }))
    expect(await repo.auth.current()).toBeNull()
    expect(await codeOf(() => repo.student.handIn('attempt-1'))).toBe('NOT_AUTHORISED')
  })
})

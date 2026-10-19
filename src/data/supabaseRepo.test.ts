import type { SupabaseClient } from '@supabase/supabase-js'
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

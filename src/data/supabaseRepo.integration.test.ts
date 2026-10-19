import { createClient } from '@supabase/supabase-js'
import { inject } from 'vitest'
import { describeRepoContract } from './contract/repoContract'
import { createSupabaseRepo } from './supabaseRepo'
import { PulseError } from './types'

// Local stack only: accounts are created from the seeded profiles on first use.
const PASSWORD = 'pulse-integration-only'

describeRepoContract('supabase (local stack)', async () => {
  const { url, key } = inject('supabase')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const repo = createSupabaseRepo(client)

  return {
    repo,
    actAs: async (email) => {
      await repo.auth.signOut()
      try {
        await repo.auth.signIn(email, PASSWORD)
      } catch (e) {
        if (!(e instanceof PulseError) || e.code !== 'BAD_CREDENTIALS') throw e
        await repo.auth.claimProfile(email, PASSWORD)
      }
    },
  }
})

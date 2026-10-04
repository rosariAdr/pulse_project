import { supabase } from '../lib/supabase'
import { createFakeRepo } from './fakeRepo'
import { createSupabaseRepo } from './supabaseRepo'
import type { PulseRepo } from './repo'

/**
 * Picks the implementation:
 *   - the Supabase one as soon as VITE_SUPABASE_URL and the anon key are set;
 *   - otherwise the in-memory fake, so the app runs with the demo class and no
 *     database at all (useful before the EU projects exist, and in tests).
 * Force the fake with VITE_DATA_SOURCE=fake.
 */
const forced = import.meta.env.VITE_DATA_SOURCE

export const usingFakeData = forced === 'fake' || supabase === null

export const repo: PulseRepo = usingFakeData ? createFakeRepo() : createSupabaseRepo(supabase!)

export * from './types'
export type { PulseRepo } from './repo'
export { createFakeRepo } from './fakeRepo'
export { DEMO_PASSWORD } from './demoData'

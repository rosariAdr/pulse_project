import { defineConfig } from 'vitest/config'

/**
 * The integration layer: the repository contract against the local Supabase
 * stack. Needs Docker. Runs after `supabase db reset`, so it starts from the
 * seeded demo class every time.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./test/supabaseGlobalSetup.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
})

import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: the journeys a real person walks, in a real browser.
 *
 * They run against the in-memory demo class (VITE_DATA_SOURCE=fake), so they
 * need no Supabase project, no Docker and no secrets — which is what makes them
 * safe to run on every pull request. What they cannot prove is RLS; that is the
 * job of supabase/tests/*.sql.
 *
 * The student journey is checked on a phone as well as a laptop, because that
 * is where it will actually be used: 25 students, in class, on their own
 * phones.
 */
export default defineConfig({
  testDir: './e2e',
  // A failing journey must be a real failure, not a slow machine.
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'] } },
    // Pixel 5 is close to the 390px the test day is designed for.
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],

  // The built app, not the dev server: what students will actually load.
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_DATA_SOURCE: 'fake' },
  },
})

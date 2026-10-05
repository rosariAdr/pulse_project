import type { Page } from '@playwright/test'

/**
 * The demo accounts from supabase/seed.sql, mirrored by the in-memory repo.
 * All fictional. The password exists only in the fake data.
 */
export const DEMO = {
  password: 'pulse-demo',
  student: 'l.fontaine@idrac.example', // class B1 · Groupe 2 → Statistiques commerciales
  classmate: 'y.cherif@idrac.example',
  otherClass: 'l.benali@abs.example', // class M2-03 → Data-Driven Marketing
  master: 'master@pulse.example',
  statModuleId: '00000000-0000-4000-8000-0000000000d1',
  ddmModuleId: '00000000-0000-4000-8000-0000000000d2',
}

/** Each test starts from a clean demo: the fake repo persists to localStorage. */
export async function resetDemo(page: Page) {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
}

export async function signIn(page: Page, email: string, password = DEMO.password) {
  await page.getByLabel('School email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

import { expect, test } from '@playwright/test'
import { DEMO, resetDemo, signIn } from './helpers'

/**
 * The email itself cannot be opened here; the in-memory repo stands in for the
 * recovery session the link creates. What is checked is everything after it.
 */
test.beforeEach(async ({ page }) => {
  await resetDemo(page)
})

test('a student chooses a new password and signs in with it', async ({ page }) => {
  await signIn(page, DEMO.student) // stands in for the session the reset link opens
  await expect(page.getByRole('heading', { name: 'Statistiques commerciales' })).toBeVisible()

  await page.goto('/reset-password')
  await page.getByLabel('New password').fill('a-brand-new-password')
  await page.getByRole('button', { name: 'Set my new password' }).click()
  await expect(page.getByRole('status')).toContainText('Your password is changed')

  await page.getByRole('link', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, DEMO.student, 'a-brand-new-password')
  await expect(page.getByRole('heading', { name: 'Statistiques commerciales' })).toBeVisible()
})

test('an expired link says so instead of failing silently', async ({ page }) => {
  await page.goto('/reset-password')
  await page.getByLabel('New password').fill('a-brand-new-password')
  await page.getByRole('button', { name: 'Set my new password' }).click()
  await expect(page.getByRole('alert')).toContainText('expired or was already used')
})

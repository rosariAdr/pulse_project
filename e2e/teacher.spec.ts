import { expect, test } from '@playwright/test'
import { DEMO, resetDemo, signIn } from './helpers'

/**
 * The other half of the loop: the teacher writes a test, publishes it, and
 * reads what the class wrote.
 */
test.beforeEach(async ({ page }) => {
  await resetDemo(page)
})

test('the master account writes a test and publishes it to a class', async ({ page }) => {
  await signIn(page, DEMO.master)
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible()

  // Data-Driven Marketing has no test yet.
  await page.goto(`/teacher/${DEMO.ddmModuleId}/test`)
  await page.getByRole('button', { name: 'Start the test' }).click()
  await expect(page.getByText(/version 1/)).toBeVisible()

  // A written question.
  await page.getByRole('button', { name: 'Short answer' }).click()
  await page.getByLabel('The question').fill('What makes a dataset trustworthy enough to decide on?')
  await page.getByRole('button', { name: 'Add the question' }).click()
  await expect(page.getByText('What makes a dataset trustworthy enough to decide on?')).toBeVisible()

  // A multiple choice, which needs at least two options.
  await page.getByRole('button', { name: 'Multiple choice' }).click()
  await page.getByLabel('The question').fill('Which measure resists outliers?')
  await page.getByLabel('Option 1').fill('The mean')
  await page.getByRole('button', { name: 'Add the question' }).click()
  await expect(page.getByRole('alert')).toContainText('not complete')

  await page.getByLabel('Option 2').fill('The median')
  await page.getByRole('button', { name: 'Add the question' }).click()
  await expect(page.getByText('· The median')).toBeVisible()

  // Publishing is final, and says so.
  await page.getByRole('button', { name: 'Publish to the class' }).click()
  const dialog = page.getByRole('dialog', { name: 'Publish to the class' })
  await expect(dialog).toContainText('can no longer change')
  await dialog.getByRole('button', { name: 'Publish', exact: true }).click()

  await expect(page.getByText(/Published — /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
})

test('what a student hands in is what the teacher reads', async ({ page }) => {
  // The student answers two questions and hands in.
  await signIn(page, DEMO.student)
  await page.getByRole('link', { name: /Statistiques commerciales/ }).click()
  await page.getByRole('link', { name: 'Start the entrance test' }).click()
  await page.getByRole('radio', { name: 'Des étalements différents' }).click()
  await page.getByRole('button', { name: /Question 3, not answered/ }).click()
  await page.getByLabel('Your answer').fill('Un niveau de satisfaction')
  await page.getByRole('button', { name: /Question 4/ }).click()
  await page.getByRole('button', { name: 'Hand in', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hand in', exact: true }).click()
  await expect(page.getByText('Handed in. Your module is unlocked.')).toBeVisible()

  // The teacher opens the raw results.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, DEMO.master)
  await page.goto(`/teacher/${DEMO.statModuleId}`)

  await expect(page.getByText('Des étalements différents').first()).toBeVisible()
  await expect(page.getByText('Un niveau de satisfaction').first()).toBeVisible()
  // The roster still shows those who did not answer.
  await expect(page.getByText('Yanis Cherif').first()).toBeVisible()
  await expect(page.getByText('No answer').first()).toBeVisible()
})

test('a student never reaches the teacher’s side', async ({ page }) => {
  await signIn(page, DEMO.student)
  await page.goto(`/teacher/${DEMO.statModuleId}`)
  // The student's routes have no teacher page: they land back on their modules.
  await expect(page).toHaveURL(/\/modules/)
  await expect(page.getByText('Raw results')).toHaveCount(0)
})

test('the raw results export a CSV', async ({ page }) => {
  await signIn(page, DEMO.master)
  await page.goto(`/teacher/${DEMO.statModuleId}`)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export CSV/i }).click()
  const file = await download

  expect(file.suggestedFilename()).toMatch(/\.csv$/)
})

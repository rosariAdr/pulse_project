import { expect, test } from '@playwright/test'
import { DEMO, resetDemo, signIn } from './helpers'

/**
 * The day the pilot stands or falls: a student arrives, signs in, takes the
 * entrance test and hands it in. Checked on a laptop and on a phone.
 */
test.beforeEach(async ({ page }) => {
  await resetDemo(page)
})

test('a student signs in, takes the test and hands it in', async ({ page }) => {
  await signIn(page, DEMO.student)

  // Lands on their own modules, and only theirs.
  await expect(page.getByRole('heading', { name: 'Statistiques commerciales' })).toBeVisible()
  await expect(page.getByText('Data-Driven Marketing')).toHaveCount(0)
  await expect(page.getByText('Entrance test to take')).toBeVisible()

  // The test is reached through its module, never on its own.
  await page.getByRole('link', { name: /Statistiques commerciales/ }).click()
  await expect(page.getByRole('heading', { name: 'Entrance test' })).toBeVisible()
  await page.getByRole('link', { name: 'Start the entrance test' }).click()

  // Question 1: a choice saves the moment it is made.
  await expect(page.getByText('Question 1 of 4')).toBeVisible()
  await page.getByRole('radio', { name: 'Des étalements différents' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // Question 3: a written answer saves when the field is left.
  await page.getByRole('button', { name: /Question 3, not answered/ }).click()
  await page.getByLabel('Your answer').fill('Un niveau de satisfaction')
  await page.getByRole('button', { name: /Question 4/ }).click()
  await expect(page.getByText(/2 answered/)).toBeVisible()

  // Handing in asks once, and says what is still blank.
  await page.getByRole('button', { name: 'Hand in', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Hand in' })
  await expect(dialog).toContainText("won't be able to change")
  await expect(dialog).toContainText('2 question(s) left blank')
  await dialog.getByRole('button', { name: 'Hand in', exact: true }).click()

  await expect(page.getByText('Handed in. Your module is unlocked.')).toBeVisible()
  await expect(page.getByText(/nobody is ranked/i)).toBeVisible()
})

test('answers survive a phone that reloads mid-test', async ({ page }) => {
  await signIn(page, DEMO.student)
  await page.getByRole('link', { name: /Statistiques commerciales/ }).click()
  await page.getByRole('link', { name: 'Start the entrance test' }).click()

  await page.getByRole('radio', { name: 'Des étalements différents' }).click()
  await expect(page.getByText('Saved')).toBeVisible()

  // The browser is killed and reopened — a dead battery, a switched app.
  await page.reload()

  await expect(page.getByRole('radio', { name: 'Des étalements différents' })).toBeChecked()
  await expect(page.getByText(/1 answered/)).toBeVisible()
})

test('a handed-in test cannot be taken again', async ({ page }) => {
  await signIn(page, DEMO.student)
  await page.getByRole('link', { name: /Statistiques commerciales/ }).click()
  await page.getByRole('link', { name: 'Start the entrance test' }).click()
  await page.getByRole('button', { name: /Question 4/ }).click()
  await page.getByRole('button', { name: 'Hand in', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hand in', exact: true }).click()
  await expect(page.getByText('Handed in. Your module is unlocked.')).toBeVisible()

  // Going back to the test lands on the confirmation, not on the questions.
  await page.goto(`/modules/${DEMO.statModuleId}/test`)
  await expect(page.getByText('Handed in. Your module is unlocked.')).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(0)
})

test('a module of another class is out of reach, even by its address', async ({ page }) => {
  await signIn(page, DEMO.student)
  await page.goto(`/modules/${DEMO.ddmModuleId}`)
  await expect(page.getByRole('alert')).toContainText('not one of yours')
})

test('the door refuses an email nobody registered', async ({ page }) => {
  await page.getByRole('button', { name: /First time here/ }).click()
  await page.getByLabel('School email').fill('stranger@nowhere.example')
  await page.getByLabel('Password', { exact: true }).fill('a-good-password')
  await page.getByRole('button', { name: 'Create my password' }).click()

  await expect(page.getByRole('alert')).toContainText('no Pulse profile')
})

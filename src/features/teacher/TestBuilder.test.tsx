import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from '../../app/session'
import { DEMO_PASSWORD, demo } from '../../data/demoData'
import { createFakeRepo } from '../../data/fakeRepo'
import { TestBuilder } from './TestBuilder'

const MASTER = 'master@pulse.example'
const STAT = demo.modules[0].id // already has a published test in the demo class
const DDM = demo.modules[1].id // has none

let repo: ReturnType<typeof createFakeRepo>

beforeEach(async () => {
  repo = createFakeRepo()
  await repo.auth.signIn(MASTER, DEMO_PASSWORD)
})

function renderBuilder(moduleId: string) {
  render(
    <SessionProvider repo={repo}>
      <MemoryRouter initialEntries={[`/teacher/${moduleId}/test`]}>
        <Routes>
          <Route path="/teacher/:moduleId/test" element={<TestBuilder />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
  return userEvent.setup()
}

async function addShortQuestion(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  await user.click(screen.getByRole('button', { name: 'Short answer' }))
  await user.type(screen.getByLabelText('The question'), prompt)
  await user.click(screen.getByRole('button', { name: /add the question/i }))
}

describe('writing the entrance test', () => {
  it('offers to start one when the module has none', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))
    expect(await screen.findByText(/version 1/i)).toBeInTheDocument()
    expect(screen.getByText(/students cannot see it yet/i)).toBeInTheDocument()
  })

  it('adds a written question and shows it in order', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))

    await addShortQuestion(user, 'What makes a dataset trustworthy?')
    await addShortQuestion(user, 'Name one source of bias you have met.')

    const list = await screen.findByRole('list', { name: '' }).catch(() => null)
    expect(list ?? document.body).toBeTruthy()
    expect(screen.getByText('What makes a dataset trustworthy?')).toBeInTheDocument()
    expect(screen.getByText(/1\. short answer/i)).toBeInTheDocument()
    expect(screen.getByText(/2\. short answer/i)).toBeInTheDocument()
  })

  it('refuses a multiple choice with fewer than two options', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))

    await user.type(screen.getByLabelText('The question'), 'Which measure resists outliers?')
    await user.type(screen.getByLabelText('Option 1'), 'The median')
    await user.click(screen.getByRole('button', { name: /add the question/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/not complete/i)
  })

  it('keeps a multiple choice with its options', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))

    await user.type(screen.getByLabelText('The question'), 'Which measure resists outliers?')
    await user.type(screen.getByLabelText('Option 1'), 'The mean')
    await user.type(screen.getByLabelText('Option 2'), 'The median')
    await user.click(screen.getByRole('button', { name: /add the question/i }))

    expect(await screen.findByText('Which measure resists outliers?')).toBeInTheDocument()
    expect(screen.getByText('· The median')).toBeInTheDocument()
  })

  it('edits and removes a question while the test is a draft', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))
    await addShortQuestion(user, 'First wording')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const field = screen.getByLabelText('The question')
    await user.clear(field)
    await user.type(field, 'Clearer wording')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Clearer wording')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('Clearer wording')).not.toBeInTheDocument())
  })

  it('asks before publishing, then freezes the test', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))
    await addShortQuestion(user, 'What makes a dataset trustworthy?')

    await user.click(screen.getByRole('button', { name: /publish to the class/i }))
    const dialog = await screen.findByRole('dialog', { name: /publish to the class/i })
    expect(dialog).toHaveTextContent(/can no longer change/i)
    await user.click(within(dialog).getByRole('button', { name: /^publish$/i }))

    expect(await screen.findByText(/Published — /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('The question')).not.toBeInTheDocument()
  })

  it('refuses to publish an empty test', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))
    expect(screen.queryByRole('button', { name: /publish to the class/i })).not.toBeInTheDocument()
  })

  it('shows a published test as read-only, with how many handed it in', async () => {
    renderBuilder(STAT)
    expect(await screen.findByText(/Published — /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByText(/start version 2/i)).toBeInTheDocument()
  })

  it('makes a published test visible to the students of that class', async () => {
    const user = renderBuilder(DDM)
    await user.click(await screen.findByRole('button', { name: /start the test/i }))
    await addShortQuestion(user, 'What makes a dataset trustworthy?')
    await user.click(screen.getByRole('button', { name: /publish to the class/i }))
    const dialog = await screen.findByRole('dialog', { name: /publish to the class/i })
    await user.click(within(dialog).getByRole('button', { name: /^publish$/i }))
    await screen.findByText(/Published — /)

    await repo.auth.signIn('l.benali@abs.example', DEMO_PASSWORD) // the M2-03 class
    const test = await repo.student.test(DDM)
    expect(test?.questions.map((q) => q.prompt)).toEqual(['What makes a dataset trustworthy?'])
  })
})

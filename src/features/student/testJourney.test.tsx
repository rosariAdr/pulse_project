import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { SessionProvider } from '../../app/session'
import { DEMO_PASSWORD, demo } from '../../data/demoData'
import { createFakeRepo } from '../../data/fakeRepo'
import { HandedIn } from './HandedIn'
import { ModulePage } from './ModulePage'
import { MyModules } from './MyModules'
import { TestRun } from './TestRun'

const LEA = 'l.fontaine@idrac.example'
const STAT = demo.modules[0].id

let repo: ReturnType<typeof createFakeRepo>

beforeEach(async () => {
  repo = createFakeRepo()
  await repo.auth.signIn(LEA, DEMO_PASSWORD)
})

/** The student's routes, so a click can actually move between screens. */
function renderJourney(at: string) {
  render(
    <SessionProvider repo={repo}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/modules" element={<MyModules />} />
          <Route path="/modules/:moduleId" element={<ModulePage />} />
          <Route path="/modules/:moduleId/test" element={<TestRun />} />
          <Route path="/modules/:moduleId/handed-in" element={<HandedIn />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
  return userEvent.setup()
}

describe('my modules', () => {
  it('lists the modules of the student’s own class and what each is waiting for', async () => {
    renderJourney('/modules')
    expect(await screen.findByText('Statistiques commerciales')).toBeInTheDocument()
    expect(screen.getByText(/entrance test to take/i)).toBeInTheDocument()
    expect(screen.queryByText('Data-Driven Marketing')).not.toBeInTheDocument()
  })
})

describe('the module page', () => {
  it('is where the entrance test lives', async () => {
    renderJourney(`/modules/${STAT}`)
    expect(await screen.findByRole('heading', { name: 'Statistiques commerciales' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start the entrance test/i })).toHaveAttribute(
      'href',
      `/modules/${STAT}/test`,
    )
  })

  it('refuses a module belonging to another class', async () => {
    renderJourney(`/modules/${demo.modules[1].id}`)
    expect(await screen.findByRole('alert')).toHaveTextContent(/not one of yours/i)
  })
})

describe('taking the test', () => {
  it('starts an attempt and saves a choice as soon as it is made', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)

    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(await screen.findByRole('radio', { name: 'Des étalements différents' }))

    await waitFor(() => expect(screen.getByText(/^saved$/i)).toBeInTheDocument())
    const test = (await repo.student.test(STAT))!
    expect(Object.values(test.answers)).toContain('Des étalements différents')
  })

  it('lets a student move between questions in any order', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)

    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(screen.getByRole('button', { name: /question 3, not answered/i }))
    expect(await screen.findByText(/variable qualitative ordinale/i)).toBeInTheDocument()
  })

  it('saves a written answer when the student leaves the field', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)

    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(screen.getByRole('button', { name: /question 3, not answered/i }))
    const field = await screen.findByLabelText(/your answer/i)
    await user.type(field, 'Un niveau de satisfaction')
    await user.tab()

    await waitFor(async () => {
      const test = (await repo.student.test(STAT))!
      expect(Object.values(test.answers)).toContain('Un niveau de satisfaction')
    })
  })

  it('asks before handing in, and says what is still blank', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)

    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(screen.getByRole('button', { name: /question 4, not answered/i }))
    await user.click(screen.getByRole('button', { name: /^hand in$/i }))

    const dialog = await screen.findByRole('dialog', { name: /hand in/i })
    expect(dialog).toHaveTextContent(/won't be able to change/i)
    expect(dialog).toHaveTextContent(/4 question\(s\) left blank/i)
  })

  it('hands in, and the module then says so', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)

    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(screen.getByRole('button', { name: /question 4, not answered/i }))
    await user.click(screen.getByRole('button', { name: /^hand in$/i }))
    await user.click(
      (await screen.findAllByRole('button', { name: /^hand in$/i })).at(-1) as HTMLElement,
    )

    expect(await screen.findByText(/your module is unlocked/i)).toBeInTheDocument()
    const module = (await repo.student.module(STAT))!
    expect(module.testStatus).toBe('handed-in')
  })

  it('sends a student who already handed in straight to the confirmation', async () => {
    const attempt = await repo.student.startAttempt(STAT)
    await repo.student.handIn(attempt.id)

    renderJourney(`/modules/${STAT}/test`)
    expect(await screen.findByText(/your module is unlocked/i)).toBeInTheDocument()
  })

  it('shows a refusal rather than pretending an answer was saved', async () => {
    const attempt = await repo.student.startAttempt(STAT)
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })

    // The test is handed in on another device, mid-question.
    await repo.student.handIn(attempt.id)
    await user.click(await screen.findByRole('radio', { name: 'Des étalements différents' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already handed this test in/i)
    expect(screen.getByText(/not saved/i)).toBeInTheDocument()
  })
})

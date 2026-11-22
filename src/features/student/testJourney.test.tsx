import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  const view = render(
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
  return Object.assign(userEvent.setup(), { unmount: view.unmount })
}

/** What the database holds for this student's test, whatever the screen says. */
async function storedAnswers() {
  const test = (await repo.student.test(STAT))!
  return Object.values(test.answers)
}

/**
 * A classroom wifi: every save waits on the wire until the test lets it
 * through (`release`) or cuts it (`cut`). Later saves go straight through.
 */
function holdSaves() {
  const real = repo.student.saveAnswer
  const held: Array<{ go: () => void; cut: (e: unknown) => void }> = []
  const spy = vi.spyOn(repo.student, 'saveAnswer').mockImplementation(
    (...args) =>
      new Promise<void>((resolve, reject) => {
        held.push({ go: () => void real(...args).then(resolve, reject), cut: reject })
      }),
  )
  const settle = async (each: (h: (typeof held)[number]) => void) => {
    spy.mockImplementation(real)
    await act(async () => held.splice(0).forEach(each))
  }
  return {
    spy,
    release: () => settle((h) => h.go()),
    cut: () => settle((h) => h.cut(new TypeError('Failed to fetch'))),
  }
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

// A classroom wifi drops requests. Whatever happens on the wire, an answer the
// student wrote is either in the database or flagged on their screen — never
// lost in silence (review PU-04, 18 Nov 2026).
describe('saving on a classroom wifi', () => {
  it('waits for the last save before handing in', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    const saves = holdSaves()
    const handIn = vi.spyOn(repo.student, 'handIn')

    await user.click(screen.getByRole('radio', { name: 'Des étalements différents' }))
    await user.click(screen.getByRole('button', { name: /question 4, not answered/i }))
    await user.click(screen.getByRole('button', { name: /^hand in$/i }))
    await user.click((await screen.findAllByRole('button', { name: /^hand in$/i })).at(-1) as HTMLElement)

    // The choice is still on the wire: handing in now would close the attempt under it.
    expect(handIn).not.toHaveBeenCalled()
    await saves.release()

    expect(await screen.findByText(/your module is unlocked/i)).toBeInTheDocument()
    expect(handIn).toHaveBeenCalledTimes(1)
    expect(await storedAnswers()).toContain('Des étalements différents')
  })

  it('keeps a failed save on screen after another question saves', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    const saves = holdSaves()

    await user.click(screen.getByRole('radio', { name: 'Des étalements différents' }))
    await saves.cut()
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i)
    expect(screen.getByText(/^not saved$/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /question 2, not answered/i }))
    await user.click(screen.getByRole('radio', { name: 'La médiane' }))
    await waitFor(() => expect(saves.spy).toHaveBeenCalledTimes(2))
    await act(() => saves.spy.mock.results[1].value)
    expect(await storedAnswers()).toEqual(['La médiane'])

    // Question 2 saved; question 1 still is not, and the screen still says so.
    expect(screen.getByRole('alert')).toHaveTextContent(/question 1 did not save/i)
    expect(screen.getByText(/^not saved$/i)).toBeInTheDocument()
    expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument()
  })

  it('does not hand in when the last save fails on the way, and says what would be lost', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    const saves = holdSaves()
    const handIn = vi.spyOn(repo.student, 'handIn')

    await user.click(screen.getByRole('radio', { name: 'Des étalements différents' }))
    await user.click(screen.getByRole('button', { name: /question 4, not answered/i }))
    await user.click(screen.getByRole('button', { name: /^hand in$/i }))
    await user.click((await screen.findAllByRole('button', { name: /^hand in$/i })).at(-1) as HTMLElement)
    await saves.cut()

    const dialog = await screen.findByRole('dialog', { name: /hand in/i })
    await waitFor(() => expect(dialog).toHaveTextContent(/1 answer\(s\) not saved/i))
    expect(screen.getByRole('alert')).toHaveTextContent(/question 1 did not save/i)
    expect(handIn).not.toHaveBeenCalled()
  })

  it('freezes the answers once the hand-in has started', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    const saves = holdSaves()

    await user.click(screen.getByRole('radio', { name: 'Des étalements différents' }))
    await user.click(screen.getByRole('button', { name: /question 4, not answered/i }))
    await user.click(screen.getByRole('button', { name: /^hand in$/i }))
    await user.click((await screen.findAllByRole('button', { name: /^hand in$/i })).at(-1) as HTMLElement)

    // An edit typed now would reach the server after the attempt closes.
    expect(screen.getByLabelText(/your answer/i)).toBeDisabled()
    await saves.release()
    expect(await screen.findByText(/your module is unlocked/i)).toBeInTheDocument()
  })

  it('never drops a typed answer when the next tap comes before the pause', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(screen.getByRole('button', { name: /question 3, not answered/i }))

    // A phone keeps its keyboard up: the field is never left, so it never blurs.
    fireEvent.change(await screen.findByLabelText(/your answer/i), {
      target: { value: 'Un niveau de satisfaction' },
    })
    fireEvent.click(screen.getByRole('button', { name: /question 1, not answered/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Des étalements différents' }))

    await waitFor(async () => expect(await storedAnswers()).toContain('Un niveau de satisfaction'), {
      timeout: 3000,
    })
    expect(await storedAnswers()).toContain('Des étalements différents')
  })

  it('sends a typed answer still waiting for its pause when the page closes', async () => {
    const user = renderJourney(`/modules/${STAT}/test`)
    await screen.findByRole('heading', { name: 'Statistiques commerciales' })
    await user.click(screen.getByRole('button', { name: /question 3, not answered/i }))

    fireEvent.change(await screen.findByLabelText(/your answer/i), {
      target: { value: 'Un niveau de satisfaction' },
    })
    user.unmount()

    await waitFor(async () => expect(await storedAnswers()).toContain('Un niveau de satisfaction'), {
      timeout: 2000,
    })
  })
})

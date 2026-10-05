import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '../../app/session'
import { DEMO_PASSWORD, demo } from '../../data/demoData'
import { createFakeRepo } from '../../data/fakeRepo'
import type { PulseRepo } from '../../data/repo'
import type { RawResults as RawResultsData } from '../../data/types'
import { RawResults, toCsv } from './RawResults'

const STATS_MODULE = demo.modules[0].id // Statistiques commerciales — has a published test
const MARKETING_MODULE = demo.modules[1].id // Data-Driven Marketing — no test yet
const QUESTIONS = demo.questions.filter((q) => q.testId === demo.tests[0].id)

const LEA_Q1 = 'Des étalements différents'
const LEA_Q3 = 'Le niveau de satisfaction :\nfaible, moyen, élevé'

function mount(repo: PulseRepo, moduleId: string) {
  const user = userEvent.setup()
  render(
    <SessionProvider repo={repo}>
      <MemoryRouter initialEntries={[`/teacher/${moduleId}`]}>
        <Routes>
          <Route path="/teacher/:moduleId" element={<RawResults />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
  return user
}

/**
 * The demo class as it looks after the first class: Léa answered two of the four
 * questions and handed in, nobody else started. That is the shape the screen has
 * to survive — partial answers and absent students, not a tidy full matrix.
 */
async function seedOneHandIn() {
  const repo = createFakeRepo()
  await repo.auth.signIn('l.fontaine@idrac.example', DEMO_PASSWORD)
  const attempt = await repo.student.startAttempt(STATS_MODULE)
  await repo.student.saveAnswer(attempt.id, QUESTIONS[0].id, LEA_Q1)
  await repo.student.saveAnswer(attempt.id, QUESTIONS[2].id, LEA_Q3)
  await repo.student.handIn(attempt.id)
  await repo.auth.signOut()
  await repo.auth.signIn('master@pulse.example', DEMO_PASSWORD)
  return repo
}

/** The card (by question) or the row (by student) that a piece of text sits in. */
function closestEl(node: HTMLElement, selector: string): HTMLElement {
  const found = node.closest(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector} around "${node.textContent}"`)
  return found
}

describe('raw results, by question', () => {
  it('shows what the student wrote, under the question they wrote it for', async () => {
    const repo = await seedOneHandIn()
    mount(repo, STATS_MODULE)

    expect(await screen.findByText(QUESTIONS[0].prompt)).toBeInTheDocument()
    const card = closestEl(screen.getByText(QUESTIONS[0].prompt), '.pl-card')
    const row = closestEl(within(card).getByText('Léa Fontaine'), 'li')

    expect(row).toHaveTextContent(LEA_Q1)
    expect(row).toHaveTextContent('Handed in')
  })

  it('reads "No answer" where the student left the box empty', async () => {
    const repo = await seedOneHandIn()
    mount(repo, STATS_MODULE)

    // Question 2 is one of the two Léa skipped.
    const card = closestEl(await screen.findByText(QUESTIONS[1].prompt), '.pl-card')
    const row = closestEl(within(card).getByText('Léa Fontaine'), 'li')

    expect(within(row).getByText('No answer')).toBeInTheDocument()
  })

  it('still lists the students who never started, so the gaps are visible', async () => {
    const repo = await seedOneHandIn()
    mount(repo, STATS_MODULE)

    const card = closestEl(await screen.findByText(QUESTIONS[0].prompt), '.pl-card')
    const row = closestEl(within(card).getByText('Yanis Cherif'), 'li')

    expect(within(row).getByText('No answer')).toBeInTheDocument()
    expect(row).toHaveTextContent('Not handed in')
    expect(screen.getByText(/1 of 5 handed in/)).toBeInTheDocument()
  })

  it('names the skill the question tests, not a mark for it', async () => {
    const repo = await seedOneHandIn()
    mount(repo, STATS_MODULE)

    const card = closestEl(await screen.findByText(QUESTIONS[0].prompt), '.pl-card')
    expect(within(card).getByText(/Question 1 · Dispersion/)).toBeInTheDocument()
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('raw results, by student', () => {
  it('keeps the answers when the teacher switches view, and switches back', async () => {
    const repo = await seedOneHandIn()
    const user = mount(repo, STATS_MODULE)
    await screen.findByText(QUESTIONS[0].prompt)

    await user.click(screen.getByRole('button', { name: 'By student' }))

    const table = screen.getByRole('table')
    const row = closestEl(within(table).getByText('Léa Fontaine'), 'tr')
    expect(row).toHaveTextContent(LEA_Q1)
    // One column per question, plus the student and the handed-in columns.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(QUESTIONS.length + 2)
    expect(within(row).getAllByText('No answer')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'By question' }))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(LEA_Q1)).toBeInTheDocument()
  })

  it('truncates in the cell but keeps the whole answer in the title', async () => {
    const repo = await seedOneHandIn()
    const user = mount(repo, STATS_MODULE)
    await screen.findByText(QUESTIONS[0].prompt)
    await user.click(screen.getByRole('button', { name: 'By student' }))

    expect(screen.getByTitle(/faible, moyen, élevé/)).toBeInTheDocument()
    // The short column heads keep the full prompt within reach too.
    expect(screen.getByTitle(QUESTIONS[0].prompt)).toBeInTheDocument()
  })

  it('opens every answer of the student whose row is clicked', async () => {
    const repo = await seedOneHandIn()
    const user = mount(repo, STATS_MODULE)
    await screen.findByText(QUESTIONS[0].prompt)
    await user.click(screen.getByRole('button', { name: 'By student' }))

    const row = closestEl(screen.getByText('Léa Fontaine'), 'tr')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    await user.click(row)

    expect(row).toHaveAttribute('aria-expanded', 'true')
    const panel = closestEl(screen.getByText(/Léa Fontaine — every answer/), '.pl-card--well')
    for (const question of QUESTIONS) {
      expect(within(panel).getByText(question.prompt)).toBeInTheDocument()
    }
    expect(within(panel).getByText(LEA_Q1)).toBeInTheDocument()
    expect(within(panel).getAllByText('No answer')).toHaveLength(2)

    await user.click(row)
    expect(screen.queryByText(/Léa Fontaine — every answer/)).not.toBeInTheDocument()
  })
})

describe('raw results, the states that are not a list of answers', () => {
  it('says so when the module has no entrance test yet', async () => {
    const repo = createFakeRepo()
    await repo.auth.signIn('master@pulse.example', DEMO_PASSWORD)
    mount(repo, MARKETING_MODULE)

    expect(await screen.findByText(/no entrance test yet/i)).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDisabled()
  })

  it('says so when nobody has answered yet, and still shows the roster', async () => {
    const repo = createFakeRepo()
    await repo.auth.signIn('master@pulse.example', DEMO_PASSWORD)
    mount(repo, STATS_MODULE)

    expect(await screen.findByText(/nobody has answered yet/i)).toBeInTheDocument()
    expect(screen.getAllByText('Léa Fontaine')).toHaveLength(QUESTIONS.length)
  })

  it('turns a refusal from the data layer into a sentence', async () => {
    const repo = createFakeRepo()
    await repo.auth.signIn('l.fontaine@idrac.example', DEMO_PASSWORD) // a student, not the master
    mount(repo, STATS_MODULE)

    expect(await screen.findByRole('alert')).toHaveTextContent(/you cannot do that/i)
  })
})

describe('toCsv', () => {
  const results: RawResultsData = {
    moduleId: 'm1',
    moduleTitle: 'Statistiques commerciales',
    testId: 't1',
    questions: [
      { id: 'q1', position: 1, kind: 'short', prompt: 'A, B or C?', options: null, skill: 'Dispersion' },
      { id: 'q2', position: 2, kind: 'short', prompt: 'Why?', options: null, skill: null },
    ],
    students: [
      {
        profileId: 's1',
        name: 'Léa Fontaine',
        className: 'B1 · Groupe 2',
        submittedAt: '2026-10-04T09:12:00.000Z',
      },
      { profileId: 's2', name: 'Cherif, Yanis', className: 'B1 · Groupe 2', submittedAt: null },
    ],
    answers: [
      {
        studentProfileId: 's1',
        studentName: 'Léa Fontaine',
        className: 'B1 · Groupe 2',
        questionId: 'q1',
        questionPosition: 1,
        prompt: 'A, B or C?',
        response: 'She said "yes",\nthen changed her mind',
        submittedAt: '2026-10-04T09:12:00.000Z',
      },
    ],
  }

  it('quotes commas, doubles quotes, keeps a newline inside the cell', () => {
    expect(toCsv(results)).toBe(
      [
        'student,class,question,prompt,response,handed_in_at',
        'Léa Fontaine,B1 · Groupe 2,1,"A, B or C?","She said ""yes"",\nthen changed her mind",2026-10-04T09:12:00.000Z',
        'Léa Fontaine,B1 · Groupe 2,2,Why?,,2026-10-04T09:12:00.000Z',
        '"Cherif, Yanis",B1 · Groupe 2,1,"A, B or C?",,',
        '"Cherif, Yanis",B1 · Groupe 2,2,Why?,,',
      ].join('\r\n'),
    )
  })

  it('writes one row per student per question, blanks and absences included', () => {
    // Rows are separated by CRLF; the newline inside a quoted cell is a bare LF,
    // so splitting on CRLF still counts rows: header + 2 students × 2 questions.
    expect(toCsv(results).split('\r\n')).toHaveLength(1 + 4)
  })

  it('exports the demo class from the data already loaded', async () => {
    const repo = await seedOneHandIn()
    const data = await repo.teacher.rawResults(STATS_MODULE)
    const csv = toCsv(data)
    const rows = csv.split('\r\n')

    expect(rows[0]).toBe('student,class,question,prompt,response,handed_in_at')
    expect(rows).toHaveLength(1 + 5 * QUESTIONS.length) // 5 students, 4 questions, no gaps
    expect(csv).toContain(LEA_Q1)
    expect(csv).toContain('Yanis Cherif') // never started, still a row per question
    expect(csv).toContain('"Le niveau de satisfaction :\nfaible, moyen, élevé"')
  })
})

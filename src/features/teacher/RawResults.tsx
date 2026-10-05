import { Fragment, useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useSession } from '../../app/session'
import type { PulseRepo } from '../../data/repo'
import { PulseError, type Question, type RawResults as RawResultsData } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, StatusPill } from '../../ui/pulse-ui-kit/react'

/**
 * Raw results: every answer, exactly as the student wrote it.
 *
 * Deliberately NOT here, and not to be added: a score, a ranking, a class
 * average, a chart. V0 proves that reading the answers teaches the teacher
 * something; the moment a number stands in for the sentence, that proof is lost.
 * Two ways in — by question (what did the class make of this one?) and by
 * student (what did this person write?) — over the same single read.
 */

type View = 'question' | 'student'

/**
 * A finished read, tagged with the repo and module it came from. Tagging lets the
 * loading state be derived during render, so walking from one module to the next
 * never shows the previous module’s answers and the effect never sets state
 * synchronously.
 */
type Load =
  | { kind: 'loading' }
  | { kind: 'error'; source: PulseRepo; moduleId: string; message: string }
  | { kind: 'ready'; source: PulseRepo; moduleId: string; results: RawResultsData }

const CSV_COLUMNS = ['student', 'class', 'question', 'prompt', 'response', 'handed_in_at'] as const

/** RFC 4180: quote only the cells that need it, and double any quote inside. */
function csvCell(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const answerKey = (profileId: string, questionId: string) => `${profileId}\u0000${questionId}`

/**
 * The export, built from the data already in the browser — no second read.
 * One row per student per question, students who never started included, so the
 * gaps are in the file rather than inferred from its absence.
 * Pure on purpose: the button only wraps this in a Blob.
 */
export function toCsv(results: RawResultsData): string {
  const responses = new Map<string, string>()
  for (const answer of results.answers) {
    responses.set(answerKey(answer.studentProfileId, answer.questionId), answer.response)
  }

  const rows: string[] = [CSV_COLUMNS.join(',')]
  for (const student of results.students) {
    for (const question of results.questions) {
      rows.push(
        [
          student.name,
          student.className,
          String(question.position),
          question.prompt,
          responses.get(answerKey(student.profileId, question.id)) ?? '',
          student.submittedAt ?? '',
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return rows.join('\r\n')
}

function csvFileName(moduleTitle: string): string {
  const slug = moduleTitle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `pulse-raw-results-${slug || 'module'}.csv`
}

function downloadCsv(results: RawResultsData): void {
  // The BOM is for Excel: without it, Léa arrives as LÃ©a.
  const blob = new Blob([`﻿${toCsv(results)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = csvFileName(results.moduleTitle)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function RawResults() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const { repo } = useSession()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [view, setView] = useState<View>('question')
  const [opened, setOpened] = useState<string | null>(null)

  useEffect(() => {
    if (!moduleId) return
    let cancelled = false
    repo.teacher.rawResults(moduleId).then(
      (results) => {
        if (!cancelled) setState({ kind: 'ready', source: repo, moduleId, results })
      },
      (error: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          source: repo,
          moduleId,
          message: error instanceof PulseError ? messageForError(error.code) : en.common.error,
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repo, moduleId])

  // No module in the URL is a broken link, not a slow read.
  const load: Load = !moduleId
    ? { kind: 'error', source: repo, moduleId: '', message: en.common.error }
    : state.kind !== 'loading' && state.source === repo && state.moduleId === moduleId
      ? state
      : { kind: 'loading' }

  const answers = load.kind === 'ready' ? load.results.answers : null

  const responses = useMemo(() => {
    const map = new Map<string, string>()
    for (const answer of answers ?? []) {
      map.set(answerKey(answer.studentProfileId, answer.questionId), answer.response)
    }
    return map
  }, [answers])

  const responseOf = useCallback(
    (profileId: string, questionId: string) => responses.get(answerKey(profileId, questionId)) ?? '',
    [responses],
  )

  if (load.kind === 'loading') {
    return (
      <Shell>
        <Card>
          <p className="pl-muted" role="status">
            {en.teacher.loading}
          </p>
        </Card>
      </Shell>
    )
  }

  if (load.kind === 'error') {
    return (
      <Shell>
        <Card>
          <p className="pl-error" role="alert">
            {load.message}
          </p>
        </Card>
      </Shell>
    )
  }

  const data = load.results
  // An open row belongs to the module that is loaded, never to the previous one.
  const openStudent = data.students.some((student) => student.profileId === opened) ? opened : null
  const handedIn = data.students.filter((student) => student.submittedAt !== null).length
  const hasRoster = data.students.length > 0
  const hasTest = data.testId !== null && data.questions.length > 0
  const nobodyAnswered = data.answers.length === 0

  return (
    <Shell title={data.moduleTitle}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="pl-eyebrow">{data.moduleTitle}</p>
          <h1 className="font-serif text-h2">{en.nav.rawResults}</h1>
          <p className="pl-muted pl-sm max-w-prose">{en.teacher.rawResultsNote}</p>
        </div>
        <Button variant="primary" disabled={!hasTest || !hasRoster} onClick={() => downloadCsv(data)}>
          {en.common.exportCsv}
        </Button>
      </header>

      {hasTest && hasRoster && (
        <p className="pl-sm">
          {en.teacher.students(data.students.length)}
          {' · '}
          {en.teacher.handedInCount(handedIn, data.students.length)}
        </p>
      )}

      {!hasTest && (
        <Card>
          <p role="status">{en.teacher.noTestYet}</p>
        </Card>
      )}

      {hasTest && !hasRoster && (
        <Card>
          <p role="status">{en.teacher.noStudents}</p>
        </Card>
      )}

      {hasTest && hasRoster && (
        <>
          {nobodyAnswered && (
            <Card>
              <p role="status">{en.teacher.nobodyAnswered}</p>
            </Card>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label={en.teacher.view}>
            <Button
              variant={view === 'question' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'question'}
              onClick={() => setView('question')}
            >
              {en.teacher.byQuestion}
            </Button>
            <Button
              variant={view === 'student' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'student'}
              onClick={() => setView('student')}
            >
              {en.teacher.byStudent}
            </Button>
          </div>

          {view === 'question' ? (
            <ByQuestion results={data} responseOf={responseOf} />
          ) : (
            <ByStudent
              results={data}
              responseOf={responseOf}
              openStudent={openStudent}
              onToggle={(profileId) =>
                setOpened((current) => (current === profileId ? null : profileId))
              }
            />
          )}
        </>
      )}
    </Shell>
  )
}

/** The page frame. A teacher screen, so it only has to hold together from 390px up. */
function Shell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6"
      aria-label={title ? `${en.nav.rawResults} — ${title}` : en.nav.rawResults}
    >
      {children}
    </section>
  )
}

function HandedIn({ submittedAt }: { submittedAt: string | null }) {
  return submittedAt === null ? (
    <StatusPill tone="neutral">{en.teacher.notHandedIn}</StatusPill>
  ) : (
    <StatusPill tone="sage">{en.status.handedIn}</StatusPill>
  )
}

/** What the student wrote, whitespace kept, or the words "No answer". */
function Response({ text }: { text: string }) {
  if (text.trim() === '') return <span className="pl-muted">{en.teacher.noAnswer}</span>
  return <span className="break-words whitespace-pre-wrap">{text}</span>
}

function questionLabel(question: Question): string {
  const base = en.teacher.questionLong(question.position)
  return question.skill ? `${base} · ${question.skill}` : base
}

function ByQuestion({
  results,
  responseOf,
}: {
  results: RawResultsData
  responseOf: (profileId: string, questionId: string) => string
}) {
  return (
    <div className="flex flex-col gap-4">
      {results.questions.map((question) => (
        <Card key={question.id}>
          <p className="pl-eyebrow">{questionLabel(question)}</p>
          <h2 className="font-serif text-h3">{question.prompt}</h2>
          <ul className="mt-3 flex flex-col">
            {results.students.map((student) => (
              <li key={student.profileId} className="pl-row">
                <div className="pl-row__body max-w-[14rem]">
                  <span className="block font-semibold">{student.name}</span>
                  <span className="pl-muted pl-xs block">{student.className}</span>
                </div>
                <div className="pl-row__body grow-[3]">
                  <Response text={responseOf(student.profileId, question.id)} />
                </div>
                <HandedIn submittedAt={student.submittedAt} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function ByStudent({
  results,
  responseOf,
  openStudent,
  onToggle,
}: {
  results: RawResultsData
  responseOf: (profileId: string, questionId: string) => string
  openStudent: string | null
  onToggle: (profileId: string) => void
}) {
  const columns = results.questions.length + 2

  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, profileId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onToggle(profileId)
  }

  return (
    <Card>
      {/* The table scrolls sideways on a phone, and the student column keeps a
          width of its own so a name never breaks one letter per line. */}
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full border-collapse text-sm">
          <caption className="pl-muted pl-sm mb-2 text-left">{en.teacher.answersTable}</caption>
          <thead>
            <tr>
              <th scope="col" className="min-w-[9rem] py-2 pr-3 text-left align-bottom">
                {en.teacher.student}
              </th>
              {results.questions.map((question) => (
                <th
                  key={question.id}
                  scope="col"
                  title={question.prompt}
                  className="min-w-[8rem] py-2 pr-3 text-left align-bottom"
                >
                  {en.teacher.questionShort(question.position)}
                </th>
              ))}
              <th scope="col" className="py-2 text-left align-bottom">
                {en.status.handedIn}
              </th>
            </tr>
          </thead>
          <tbody>
            {results.students.map((student) => {
              const open = openStudent === student.profileId
              return (
                <Fragment key={student.profileId}>
                  <tr
                    className="pl-row cursor-pointer"
                    tabIndex={0}
                    aria-expanded={open}
                    aria-label={en.teacher.showAnswers(student.name)}
                    onClick={() => onToggle(student.profileId)}
                    onKeyDown={(event) => onRowKey(event, student.profileId)}
                  >
                    <th scope="row" className="py-2 pr-3 text-left align-top">
                      <span className="block font-semibold whitespace-nowrap">{student.name}</span>
                      <span className="pl-muted pl-xs block whitespace-nowrap">{student.className}</span>
                    </th>
                    {results.questions.map((question) => {
                      const response = responseOf(student.profileId, question.id)
                      const blank = response.trim() === ''
                      return (
                        <td key={question.id} className="py-2 pr-3 align-top">
                          <span
                            className="block max-w-[14rem] truncate"
                            title={blank ? en.teacher.noAnswer : response}
                          >
                            {blank ? <span className="pl-muted">{en.teacher.noAnswer}</span> : response}
                          </span>
                        </td>
                      )
                    })}
                    <td className="py-2 align-top">
                      <HandedIn submittedAt={student.submittedAt} />
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={columns} className="pb-3">
                        <div className="pl-card pl-card--well">
                          <h3 className="font-serif text-h3">{en.teacher.fullAnswers(student.name)}</h3>
                          <dl className="mt-2 flex flex-col gap-3">
                            {results.questions.map((question) => (
                              <div key={question.id}>
                                <dt className="pl-sm font-semibold">
                                  <span className="pl-eyebrow block">{questionLabel(question)}</span>
                                  {question.prompt}
                                </dt>
                                <dd className="pl-sm mt-1">
                                  <Response text={responseOf(student.profileId, question.id)} />
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

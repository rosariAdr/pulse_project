import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/session'
import { MAX_ANSWER_LENGTH, PulseError, type Attempt, type Question, type TestForStudent } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, Choice, Progress, TextAreaField } from '../../ui/pulse-ui-kit/react'

/** Where one answer stands on its way to the database. */
type Save = { state: 'saving' | 'saved' } | { state: 'failed'; error: string }

/** How long after the last keystroke an open answer is sent. */
const AUTOSAVE_DELAY_MS = 800

const errorText = (e: unknown) => (e instanceof PulseError ? messageForError(e.code) : en.common.error)

const failedIds = (saves: Record<string, Save>) => Object.keys(saves).filter((id) => saves[id].state === 'failed')

/**
 * The entrance test, taken in class on a phone.
 *
 * What the classroom demands, and what this screen does about it:
 * - every answer is saved as it is written, so a dead battery costs one answer
 *   at worst — and the student can see that it saved;
 * - a refusal is shown, never swallowed: the data layer raises rather than
 *   quietly saving nothing;
 * - each question keeps its own save state, so a failed answer stays flagged
 *   until that answer itself saves — another question saving does not hide it;
 * - handing in first sends what is still waiting and waits for every save on
 *   the wire; if one fails meanwhile, nothing is handed in until the student
 *   has seen what would be lost; meanwhile the answers are frozen, since an
 *   edit would reach an attempt that is closing;
 * - questions can be revisited in any order, because this is a starting point,
 *   not an exam;
 * - handing in asks once, and cannot be undone.
 */
export function TestRun() {
  const { moduleId = '' } = useParams()
  const { repo } = useSession()
  const navigate = useNavigate()

  const [test, setTest] = useState<TestForStudent | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [saves, setSaves] = useState<Record<string, Save>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [handingIn, setHandingIn] = useState<'waiting' | 'sending' | null>(null)
  const [loading, setLoading] = useState(true)

  /** The same save states, readable after an await (state would be stale there). */
  const savesNow = useRef<Record<string, Save>>({})
  /** Typed answers waiting for their pause — one per question, so typing in one never cancels another. */
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; value: string }>())
  /** Saves on the wire. Handing in waits for every one of them. */
  const inFlight = useRef(new Set<Promise<void>>())
  /** The last save sent for each question: only its outcome counts. */
  const latest = useRef(new Map<string, number>())

  // Open the test: load it, and start the attempt if this is the first visit.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const loaded = await repo.student.test(moduleId)
        if (cancelled) return
        if (!loaded) {
          setError(messageForError('TEST_NOT_AVAILABLE'))
          return
        }
        setTest(loaded)
        setAnswers(loaded.answers)

        if (loaded.attempt?.submittedAt) {
          navigate(`/modules/${moduleId}/handed-in`, { replace: true })
          return
        }

        const open = loaded.attempt ?? (await repo.student.startAttempt(moduleId))
        if (!cancelled) setAttempt(open)
      } catch (e) {
        if (!cancelled) setError(e instanceof PulseError ? messageForError(e.code) : en.common.error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repo, moduleId, navigate])

  const mark = useCallback((questionId: string, save: Save) => {
    savesNow.current = { ...savesNow.current, [questionId]: save }
    setSaves(savesNow.current)
  }, [])

  /** Sends one answer now. The promise never rejects: a failure is marked on that question. */
  const persist = useCallback(
    (questionId: string, value: string): Promise<void> => {
      if (!attempt) return Promise.resolve()
      const queued = pending.current.get(questionId)
      if (queued) {
        clearTimeout(queued.timer)
        pending.current.delete(questionId)
      }
      const seq = (latest.current.get(questionId) ?? 0) + 1
      latest.current.set(questionId, seq)
      mark(questionId, { state: 'saving' })

      const save = (async () => {
        try {
          await repo.student.saveAnswer(attempt.id, questionId, value)
          if (latest.current.get(questionId) === seq) mark(questionId, { state: 'saved' })
        } catch (e) {
          if (latest.current.get(questionId) === seq) mark(questionId, { state: 'failed', error: errorText(e) })
        }
      })()
      inFlight.current.add(save)
      void save.finally(() => inFlight.current.delete(save))
      return save
    },
    [repo, attempt, mark],
  )

  // Leaving the page must not drop an answer still waiting for its pause.
  useEffect(() => {
    const waiting = pending.current
    return () => {
      for (const [questionId, queued] of waiting) void persist(questionId, queued.value)
    }
  }, [persist])

  /** A choice is a decision: save it at once. Typing waits for a pause. */
  const answer = (question: Question, value: string, immediate: boolean) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }))
    if (immediate) {
      void persist(question.id, value)
      return
    }
    const queued = pending.current.get(question.id)
    if (queued) clearTimeout(queued.timer)
    pending.current.set(question.id, {
      value,
      timer: setTimeout(() => void persist(question.id, value), AUTOSAVE_DELAY_MS),
    })
  }

  async function handIn() {
    if (!attempt || handingIn) return
    // What the dialog showed when the student decided.
    const known = new Set(failedIds(savesNow.current))
    setError(null)
    setHandingIn('waiting')

    // Handing in closes the attempt: any save still on its way would be refused.
    while (pending.current.size > 0 || inFlight.current.size > 0) {
      for (const [questionId, queued] of pending.current) void persist(questionId, queued.value)
      await Promise.allSettled([...inFlight.current])
    }
    if (failedIds(savesNow.current).some((id) => !known.has(id))) {
      // A save failed while we waited. The dialog now says what would be lost;
      // nothing is handed in until the student decides again.
      setHandingIn(null)
      return
    }

    setHandingIn('sending')
    try {
      await repo.student.handIn(attempt.id)
      navigate(`/modules/${moduleId}/handed-in`, { replace: true })
    } catch (e) {
      setHandingIn(null)
      setConfirming(false)
      setError(errorText(e))
    }
  }

  if (loading) return <p className="text-ink-muted">Loading…</p>

  if (!test || !attempt) {
    return (
      <p className="pl-error" role="alert">
        {error ?? messageForError('TEST_NOT_AVAILABLE')}
      </p>
    )
  }

  const question = test.questions[index]
  const answered = test.questions.filter((q) => (answers[q.id] ?? '').trim() !== '').length
  const last = index === test.questions.length - 1

  // Numbered as the student sees them. A failure outranks every success.
  const failed = test.questions.flatMap((q, i) => {
    const save = saves[q.id]
    return save?.state === 'failed' ? [{ id: q.id, number: i + 1, error: save.error }] : []
  })
  const states = Object.values(saves).map((s) => s.state)
  const saveStatus =
    failed.length > 0
      ? en.test.notSaved
      : states.includes('saving')
        ? en.test.saving
        : states.includes('saved')
          ? en.test.saved
          : ''

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5">
      <header className="grid gap-2">
        <h1 className="font-serif text-h3">{test.moduleTitle}</h1>
        <Progress
          value={((index + 1) / test.questions.length) * 100}
          label={`Question ${index + 1} of ${test.questions.length}`}
        />
        <p className="text-ink-muted text-sm" aria-live="polite">
          Question {index + 1} of {test.questions.length} · {answered} answered · <span>{saveStatus}</span>
        </p>
      </header>

      {(error || failed.length > 0) && (
        <div className="pl-error grid gap-1" role="alert">
          {error && <p>{error}</p>}
          {failed.map((f) => (
            <p key={f.id}>
              {en.test.didNotSave(f.number)} {f.error}
            </p>
          ))}
        </div>
      )}

      <Card>
        <p className="text-ink-muted text-xs uppercase">{question.skill ?? 'Entrance test'}</p>
        <h2 className="font-serif text-title">{question.prompt}</h2>

        {question.kind === 'mcq' && question.options ? (
          <fieldset className="grid gap-2 border-0 p-0">
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option) => (
              <Choice
                key={option}
                name={`q-${question.id}`}
                value={option}
                checked={answers[question.id] === option}
                disabled={handingIn !== null}
                onChange={() => answer(question, option, true)}
              >
                {option}
              </Choice>
            ))}
          </fieldset>
        ) : (
          <TextAreaField
            id={`q-${question.id}`}
            label="Your answer"
            rows={5}
            maxLength={MAX_ANSWER_LENGTH}
            value={answers[question.id] ?? ''}
            disabled={handingIn !== null}
            onChange={(e) => answer(question, e.target.value, false)}
            onBlur={(e) => void persist(question.id, e.target.value)}
          />
        )}
      </Card>

      <nav className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          {en.common.back}
        </Button>
        {!last && <Button onClick={() => setIndex((i) => i + 1)}>{en.common.next}</Button>}
        {last && (
          <Button variant="primary" onClick={() => setConfirming(true)}>
            {en.test.handIn}
          </Button>
        )}
      </nav>

      {/* Any question, in any order: a student who skipped one must be able to go back. */}
      <ol className="flex flex-wrap gap-2" aria-label="Questions">
        {test.questions.map((q, i) => (
          <li key={q.id}>
            <Button
              aria-label={`Question ${i + 1}${(answers[q.id] ?? '').trim() ? ', answered' : ', not answered'}`}
              aria-current={i === index ? 'step' : undefined}
              variant={i === index ? 'primary' : (answers[q.id] ?? '').trim() ? 'secondary' : 'ghost'}
              onClick={() => setIndex(i)}
            >
              {i + 1}
            </Button>
          </li>
        ))}
      </ol>

      {confirming && (
        <Card well role="dialog" aria-label={en.test.handIn}>
          <p>{en.test.confirmHandIn}</p>
          {answered < test.questions.length && (
            <p className="text-ink-muted text-sm">
              {test.questions.length - answered} question(s) left blank. That is allowed.
            </p>
          )}
          {failed.length > 0 && <p className="pl-error">{en.test.unsavedOnHandIn(failed.length)}</p>}
          {/* Mounted before it speaks, so screen readers announce the wait. */}
          <p className="text-ink-muted text-sm" aria-live="polite">
            {handingIn === 'waiting' ? en.test.savingBeforeHandIn : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" disabled={handingIn !== null} onClick={() => void handIn()}>
              {en.test.handIn}
            </Button>
            <Button disabled={handingIn !== null} onClick={() => setConfirming(false)}>
              {en.common.cancel}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

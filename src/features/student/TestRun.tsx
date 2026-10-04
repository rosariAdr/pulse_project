import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSession } from '../../app/session'
import { MAX_ANSWER_LENGTH, PulseError, type Attempt, type Question, type TestForStudent } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, Choice, Progress, TextAreaField } from '../../ui/pulse-ui-kit/react'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** How long after the last keystroke an open answer is sent. */
const AUTOSAVE_DELAY_MS = 800

/**
 * The entrance test, taken in class on a phone.
 *
 * What the classroom demands, and what this screen does about it:
 * - every answer is saved as it is written, so a dead battery costs one answer
 *   at worst — and the student can see that it saved;
 * - a refusal is shown, never swallowed: the data layer raises rather than
 *   quietly saving nothing;
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
  const [save, setSave] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(true)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (timer.current) clearTimeout(timer.current)
    }
  }, [repo, moduleId, navigate])

  const persist = useCallback(
    async (questionId: string, value: string) => {
      if (!attempt) return
      setSave('saving')
      try {
        await repo.student.saveAnswer(attempt.id, questionId, value)
        setSave('saved')
        setError(null)
      } catch (e) {
        setSave('failed')
        setError(e instanceof PulseError ? messageForError(e.code) : en.common.error)
      }
    },
    [repo, attempt],
  )

  /** A choice is a decision: save it at once. Typing waits for a pause. */
  const answer = (question: Question, value: string, immediate: boolean) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }))
    if (timer.current) clearTimeout(timer.current)
    if (immediate) void persist(question.id, value)
    else timer.current = setTimeout(() => void persist(question.id, value), AUTOSAVE_DELAY_MS)
  }

  async function handIn() {
    if (!attempt) return
    if (timer.current) clearTimeout(timer.current)
    try {
      await repo.student.handIn(attempt.id)
      navigate(`/modules/${moduleId}/handed-in`, { replace: true })
    } catch (e) {
      setConfirming(false)
      setError(e instanceof PulseError ? messageForError(e.code) : en.common.error)
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

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-5">
      <header className="grid gap-2">
        <h1 className="font-serif text-h3">{test.moduleTitle}</h1>
        <Progress
          value={((index + 1) / test.questions.length) * 100}
          label={`Question ${index + 1} of ${test.questions.length}`}
        />
        <p className="text-ink-muted text-sm" aria-live="polite">
          Question {index + 1} of {test.questions.length} · {answered} answered ·{' '}
          <span>
            {save === 'saving' ? en.test.saving : save === 'saved' ? en.test.saved : save === 'failed' ? 'Not saved' : ''}
          </span>
        </p>
      </header>

      {error && (
        <p className="pl-error" role="alert">
          {error}
        </p>
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
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void handIn()}>
              {en.test.handIn}
            </Button>
            <Button onClick={() => setConfirming(false)}>{en.common.cancel}</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

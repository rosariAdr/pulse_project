import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useSession } from '../../app/session'
import {
  PulseError,
  type NewQuestion,
  type Question,
  type QuestionKind,
  type TestForTeacher,
} from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, StatusPill, TextAreaField, TextField } from '../../ui/pulse-ui-kit/react'

const KINDS: { value: QuestionKind; label: string; help: string }[] = [
  { value: 'mcq', label: 'Multiple choice', help: 'A few options, one picked. Quick to answer, quick to read.' },
  { value: 'short', label: 'Short answer', help: 'A sentence or two, in the student’s own words.' },
  { value: 'judgment', label: 'Judgment', help: 'What would you check, and why. Longer to read, worth it.' },
]

const emptyDraft: NewQuestion = { kind: 'mcq', prompt: '', options: ['', ''], skill: null }

/**
 * Where the entrance test is written. V0 has no publishing check and no AI: the
 * founders write the questions and publish them directly.
 *
 * Publishing is the point of no return — a live test is versioned, never
 * edited — so it is said plainly, and editing a published test is not offered.
 */
export function TestBuilder() {
  const { moduleId = '' } = useParams()
  const { repo } = useSession()

  const [test, setTest] = useState<TestForTeacher | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<NewQuestion>(emptyDraft)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const show = (e: unknown) => setError(e instanceof PulseError ? messageForError(e.code) : en.common.error)

  const load = useCallback(async () => {
    try {
      setTest(await repo.teacher.test(moduleId))
    } catch (e) {
      show(e)
    } finally {
      setLoading(false)
    }
  }, [repo, moduleId])

  useEffect(() => {
    void load()
  }, [load])

  const editable = test?.status === 'draft'

  async function startDraft() {
    setError(null)
    try {
      setTest(await repo.teacher.createDraft(moduleId))
    } catch (e) {
      show(e)
    }
  }

  async function saveQuestion() {
    if (!test) return
    setError(null)
    try {
      if (editing) await repo.teacher.updateQuestion(editing, draft)
      else await repo.teacher.addQuestion(test.id, draft)
      setDraft(emptyDraft)
      setEditing(null)
      await load()
    } catch (e) {
      show(e)
    }
  }

  async function remove(question: Question) {
    setError(null)
    try {
      await repo.teacher.removeQuestion(question.id)
      if (editing === question.id) {
        setEditing(null)
        setDraft(emptyDraft)
      }
      await load()
    } catch (e) {
      show(e)
    }
  }

  async function publish() {
    if (!test) return
    setError(null)
    try {
      await repo.teacher.publish(test.id)
      setConfirming(false)
      await load()
    } catch (e) {
      setConfirming(false)
      show(e)
    }
  }

  function edit(question: Question) {
    setEditing(question.id)
    setDraft({
      kind: question.kind,
      prompt: question.prompt,
      options: question.options ? [...question.options] : ['', ''],
      skill: question.skill,
    })
  }

  if (loading) return <p className="text-ink-muted">{en.teacher.loading}</p>

  return (
    <div className="grid gap-5">
      <header className="grid gap-1">
        <h1 className="font-serif text-h3">Entrance test</h1>
        {test && (
          <p className="text-ink-muted text-sm">
            {test.moduleTitle} · version {test.version} · {test.questions.length} question(s)
          </p>
        )}
      </header>

      {error && (
        <p className="pl-error" role="alert">
          {error}
        </p>
      )}

      {!test && (
        <Card>
          <h2 className="font-serif text-title">No test yet</h2>
          <p className="text-ink-muted">
            Write the questions here, then publish. Students take it in the first class; nothing is marked.
          </p>
          <Button variant="primary" onClick={() => void startDraft()}>
            Start the test
          </Button>
        </Card>
      )}

      {test && (
        <>
          <Card>
            <StatusPill tone={test.status === 'published' ? 'sage' : 'neutral'}>
              {test.status === 'published' ? en.status.published : en.status.draft}
            </StatusPill>
            {test.status === 'published' ? (
              <p className="text-ink-muted">
                Published — {test.handedIn} student(s) have handed it in. It cannot change now. To ask
                something different, start version {test.version + 1}.
              </p>
            ) : (
              <p className="text-ink-muted">
                A draft: students cannot see it yet. Publishing is final, so read it through first.
              </p>
            )}
          </Card>

          <ol className="grid gap-3">
            {test.questions.map((q) => (
              <li key={q.id}>
                <Card>
                  <p className="text-ink-muted text-xs uppercase">
                    {q.position}. {KINDS.find((k) => k.value === q.kind)?.label}
                    {q.skill ? ` · ${q.skill}` : ''}
                  </p>
                  <p>{q.prompt}</p>
                  {q.options && (
                    <ul className="text-ink-muted text-sm">
                      {q.options.map((o) => (
                        <li key={o}>· {o}</li>
                      ))}
                    </ul>
                  )}
                  {editable && (
                    <div className="flex gap-2">
                      <Button onClick={() => edit(q)}>Edit</Button>
                      <Button variant="risk" onClick={() => void remove(q)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ol>

          {editable && (
            <Card well>
              <h2 className="font-serif text-title">{editing ? 'Edit the question' : 'Add a question'}</h2>

              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <Button
                    key={k.value}
                    aria-pressed={draft.kind === k.value}
                    variant={draft.kind === k.value ? 'secondary' : 'ghost'}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        kind: k.value,
                        options: k.value === 'mcq' ? (d.options ?? ['', '']) : null,
                      }))
                    }
                  >
                    {k.label}
                  </Button>
                ))}
              </div>
              <p className="text-ink-muted text-sm">{KINDS.find((k) => k.value === draft.kind)?.help}</p>

              <TextAreaField
                id="question-prompt"
                label="The question"
                rows={3}
                value={draft.prompt}
                onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              />

              {draft.kind === 'mcq' && (
                <fieldset className="grid gap-2 border-0 p-0">
                  <legend className="pl-label">Options</legend>
                  {(draft.options ?? []).map((option, i) => (
                    <TextField
                      key={i}
                      id={`option-${i}`}
                      label={`Option ${i + 1}`}
                      value={option}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          options: (d.options ?? []).map((o, j) => (j === i ? e.target.value : o)),
                        }))
                      }
                    />
                  ))}
                  <Button
                    onClick={() => setDraft((d) => ({ ...d, options: [...(d.options ?? []), ''] }))}
                  >
                    Add an option
                  </Button>
                </fieldset>
              )}

              <TextField
                id="question-skill"
                label="Skill (optional)"
                hint="What this question tells you about, e.g. Dispersion"
                value={draft.skill ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, skill: e.target.value || null }))}
              />

              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void saveQuestion()}>
                  {editing ? en.common.save : 'Add the question'}
                </Button>
                {editing && (
                  <Button
                    onClick={() => {
                      setEditing(null)
                      setDraft(emptyDraft)
                    }}
                  >
                    {en.common.cancel}
                  </Button>
                )}
              </div>
            </Card>
          )}

          {editable && test.questions.length > 0 && !confirming && (
            <Button variant="primary" size="lg" onClick={() => setConfirming(true)}>
              Publish to the class
            </Button>
          )}

          {confirming && (
            <Card role="dialog" aria-label="Publish to the class">
              <p>
                Publish {test.questions.length} question(s)? Students can take the test straight away, and the
                questions can no longer change.
              </p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void publish()}>
                  Publish
                </Button>
                <Button onClick={() => setConfirming(false)}>{en.common.cancel}</Button>
              </div>
            </Card>
          )}
        </>
      )}

      <Link to={`/teacher/${moduleId}`} className="pl-btn pl-btn--ghost">
        {en.nav.rawResults}
      </Link>
    </div>
  )
}

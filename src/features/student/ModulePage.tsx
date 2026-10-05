import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useSession } from '../../app/session'
import { PulseError, type StudentModule, type TestForStudent } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, StatusPill } from '../../ui/pulse-ui-kit/react'

/**
 * One module, and in V0 one thing inside it: its entrance test. The test lives
 * here and nowhere else — a test without its module means nothing.
 * Sessions and exercises arrive in V1; the card below says so rather than
 * pretending they are missing.
 */
export function ModulePage() {
  const { moduleId = '' } = useParams()
  const { repo } = useSession()
  const [module, setModule] = useState<StudentModule | null>(null)
  const [test, setTest] = useState<TestForStudent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([repo.student.module(moduleId), repo.student.test(moduleId)])
      .then(([m, t]) => {
        if (cancelled) return
        setModule(m)
        setTest(t)
      })
      .catch((e) => !cancelled && setError(e instanceof PulseError ? messageForError(e.code) : en.common.error))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [repo, moduleId])

  if (loading) return <p className="text-ink-muted">Loading…</p>

  if (error) {
    return (
      <p className="pl-error" role="alert">
        {error}
      </p>
    )
  }

  if (!module) {
    return (
      <div>
        <p className="pl-error" role="alert">
          This module is not one of yours.
        </p>
        <Link to="/modules" className="pl-btn pl-btn--ghost">
          {en.nav.myModules}
        </Link>
      </div>
    )
  }

  const status = module.testStatus
  const questionCount = test?.questions.length ?? 0

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="font-serif text-h2">{module.title}</h1>
        <p className="text-ink-muted text-sm">{module.className}</p>
      </header>

      <Card>
        <StatusPill tone={status === 'handed-in' ? 'sage' : 'gold'}>
          {status === 'handed-in' ? en.status.handedIn : 'Entrance test'}
        </StatusPill>
        <h2 className="font-serif text-h3">Entrance test</h2>

        {status === 'none' && (
          <p className="text-ink-muted">
            Your teacher has not published the entrance test for this module yet.
          </p>
        )}

        {status === 'not-started' && (
          <>
            <p className="text-ink-muted">
              {questionCount} questions, about {test?.timeLimitMinutes ?? 20} minutes, taken in class. It is
              not marked: it shows your teacher where to start.
            </p>
            <Link to={`/modules/${module.id}/test`} className="pl-btn pl-btn--primary pl-btn--lg pl-btn--block">
              {en.test.start}
            </Link>
          </>
        )}

        {status === 'in-progress' && (
          <>
            <p className="text-ink-muted">
              You have started. Your answers are saved as you write them.
            </p>
            <Link to={`/modules/${module.id}/test`} className="pl-btn pl-btn--primary pl-btn--lg pl-btn--block">
              {en.test.resume}
            </Link>
          </>
        )}

        {status === 'handed-in' && (
          <p className="text-ink-muted">
            Handed in. Your answers are with your teacher; nobody else can read them.
          </p>
        )}
      </Card>

      <Card well>
        <h2 className="font-serif text-title">Sessions</h2>
        <p className="text-ink-muted text-sm">
          Session material and exercises open here later in the course.
        </p>
      </Card>

      <Button variant="ghost" onClick={() => history.back()}>
        {en.common.back}
      </Button>
    </div>
  )
}

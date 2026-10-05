import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../app/session'
import { PulseError, type StudentModule } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { StatusPill } from '../../ui/pulse-ui-kit/react'

const label: Record<StudentModule['testStatus'], { text: string; tone: 'sage' | 'gold' | 'neutral' }> = {
  none: { text: 'No test yet', tone: 'neutral' },
  'not-started': { text: 'Entrance test to take', tone: 'gold' },
  'in-progress': { text: en.status.inProgress, tone: 'gold' },
  'handed-in': { text: en.status.handedIn, tone: 'sage' },
}

/**
 * Where a student lands. One card per module of their class, each saying what
 * the module is waiting for. The entrance test is never reached from here
 * directly: it belongs to its module, so the path is always module → test.
 */
export function MyModules() {
  const { repo } = useSession()
  const [modules, setModules] = useState<StudentModule[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    repo.student
      .modules()
      .then((m) => !cancelled && setModules(m))
      .catch((e) => !cancelled && setError(e instanceof PulseError ? messageForError(e.code) : en.common.error))
    return () => {
      cancelled = true
    }
  }, [repo])

  if (error) {
    return (
      <p className="pl-error" role="alert">
        {error}
      </p>
    )
  }

  if (!modules) return <p className="text-ink-muted">Loading…</p>

  if (modules.length === 0) {
    return (
      <p className="text-ink-muted">
        No module yet. Your teacher attaches your class to a module before the first session.
      </p>
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {modules.map((m) => {
        const state = label[m.testStatus]
        return (
          <li key={m.id}>
            <Link to={`/modules/${m.id}`} className="pl-card pl-card--link block">
              <StatusPill tone={state.tone}>{state.text}</StatusPill>
              <h2 className="font-serif text-title">{m.title}</h2>
              <p className="text-ink-muted text-sm">
                {m.className}
                {m.code ? ` · ${m.code}` : ''}
              </p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

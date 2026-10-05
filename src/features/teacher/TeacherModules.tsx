import { useEffect, useState, type PointerEvent } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../app/session'
import type { PulseRepo } from '../../data/repo'
import { PulseError, type TeacherModule, type TestStatus } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Arrow, Card, Progress, StatusPill, usePointerSheen, type PillTone } from '../../ui/pulse-ui-kit/react'

/**
 * The master account's modules, one row each, every row a door into the module.
 *
 * It answers the only three questions the founders ask before a class starts:
 * is the entrance test published, who is in it, and how many have handed in.
 * No score and no ranking live on this screen — that is the raw-results rule,
 * and it starts here.
 */

/**
 * A finished read, tagged with the repo it came from. Tagging lets the loading
 * state be derived during render, so swapping the repo never flashes another
 * account's modules and the effect never has to set state synchronously.
 */
type Load =
  | { kind: 'loading' }
  | { kind: 'error'; source: PulseRepo; message: string }
  | { kind: 'ready'; source: PulseRepo; modules: TeacherModule[] }

/** Status is colour plus a word. Only "published" earns a colour; the rest stay neutral. */
const TEST_PILL: Record<TestStatus | 'none', { tone: PillTone; label: string }> = {
  published: { tone: 'sage', label: en.status.published },
  draft: { tone: 'neutral', label: en.status.draft },
  closed: { tone: 'neutral', label: en.status.closed },
  none: { tone: 'neutral', label: en.status.noTest },
}

export function TeacherModules() {
  const { repo } = useSession()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const sheen = usePointerSheen<HTMLAnchorElement>()

  const load: Load = state.kind === 'loading' || state.source === repo ? state : { kind: 'loading' }

  useEffect(() => {
    let cancelled = false
    repo.teacher.modules().then(
      (modules) => {
        if (!cancelled) setState({ kind: 'ready', source: repo, modules })
      },
      (error: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          source: repo,
          message: error instanceof PulseError ? messageForError(error.code) : en.common.error,
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repo])

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-serif text-h2">{en.teacher.modulesTitle}</h1>
        <p className="pl-muted pl-sm">{en.teacher.modulesIntro}</p>
      </header>

      {load.kind === 'loading' && (
        <Card>
          <p className="pl-muted" role="status">
            {en.teacher.loading}
          </p>
        </Card>
      )}

      {load.kind === 'error' && (
        <Card>
          <p className="pl-error" role="alert">
            {load.message}
          </p>
        </Card>
      )}

      {load.kind === 'ready' && load.modules.length === 0 && (
        <Card>
          <h2 className="font-serif text-h3">{en.teacher.modulesTitle}</h2>
          <p className="pl-muted">{en.teacher.modulesEmpty}</p>
        </Card>
      )}

      {load.kind === 'ready' &&
        load.modules.map((module) => (
          <ModuleRow key={module.id} module={module} onPointerMove={sheen} />
        ))}
    </section>
  )
}

function ModuleRow({
  module,
  onPointerMove,
}: {
  module: TeacherModule
  onPointerMove: (event: PointerEvent<HTMLAnchorElement>) => void
}) {
  const pill = TEST_PILL[module.testStatus]
  const meta = [module.code, module.language.toUpperCase(), en.teacher.sessions(module.sessionCount)]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const percent = module.studentCount === 0 ? 0 : (module.handedIn / module.studentCount) * 100
  const handedIn = en.teacher.handedInCount(module.handedIn, module.studentCount)

  return (
    <Link to={`/teacher/${module.id}`} className="pl-card pl-card--link" onPointerMove={onPointerMove}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-h3">{module.title}</h2>
          <p className="pl-muted pl-sm">{meta}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
          <Arrow />
        </span>
      </div>

      <p className="pl-sm mt-2">
        {module.classNames.length > 0 ? module.classNames.join(' · ') : en.teacher.noClass}
        {' · '}
        {en.teacher.students(module.studentCount)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[8rem] grow">
          <Progress value={percent} label={handedIn} />
        </div>
        <span className="pl-muted pl-sm shrink-0">{handedIn}</span>
      </div>
    </Link>
  )
}

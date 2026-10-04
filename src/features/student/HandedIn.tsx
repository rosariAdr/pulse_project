import { Link, useParams } from 'react-router'
import { en } from '../../i18n/en'
import { Card, StatusPill } from '../../ui/pulse-ui-kit/react'

/**
 * The end of the test, and the end of V0 for the student: handed in, nothing
 * more. No score, no advice, and not even their own answers back — reading
 * them again arrives with the results screen in V1. Saying so plainly beats
 * leaving a student wondering whether something failed.
 */
export function HandedIn() {
  const { moduleId = '' } = useParams()

  return (
    <div className="mx-auto grid w-full max-w-md gap-5 text-center">
      <Card>
        <StatusPill tone="sage">{en.status.handedIn}</StatusPill>
        <h1 className="font-serif text-h3">{en.test.handedIn}</h1>
        <p className="text-ink-muted">
          Your answers are with your teacher. No one else can read them, and nobody is ranked.
        </p>
        <p className="text-ink-muted text-sm">
          There is nothing else to do now — your teacher will use these answers to start the course.
        </p>
        <Link to={`/modules/${moduleId}`} className="pl-btn pl-btn--secondary pl-btn--block">
          Back to the module
        </Link>
      </Card>
    </div>
  )
}

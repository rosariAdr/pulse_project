import { useState, type FormEvent } from 'react'
import { useSession } from '../../app/session'
import { PulseError } from '../../data/types'
import { en } from '../../i18n/en'
import { messageForError } from '../../i18n/en'
import { Button, Card, Ground, TextField } from '../../ui/pulse-ui-kit/react'

type Mode = 'signin' | 'claim' | 'reset'

const MIN_PASSWORD = 8

/**
 * The door. Three things and no more: sign in, create the account from a
 * profile that already exists, ask for a reset link.
 *
 * Mobile-first: this is the first screen 25 students meet, on their phones, in
 * class. Nothing here reveals whether an email exists except where the product
 * must say so — claiming a profile — because that message is the one that tells
 * a student they typed the wrong address.
 */
export function DoorScreen() {
  const { repo, signIn, claimProfile } = useSession()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setNotice(null)
    setPassword('')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    if (mode === 'claim' && password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`)
      return
    }

    setBusy(true)
    try {
      if (mode === 'signin') await signIn(email, password)
      else if (mode === 'claim') await claimProfile(email, password)
      else {
        await repo.auth.requestPasswordReset(email)
        setNotice(en.door.resetSent)
      }
    } catch (e) {
      setError(e instanceof PulseError ? messageForError(e.code) : en.common.error)
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'signin' ? en.door.signIn : mode === 'claim' ? en.door.createPassword : en.door.sendReset

  return (
    <div className="pl-app">
      <Ground />
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="font-serif text-h2">Pulse</h1>
          <p className="text-ink-muted text-sm">Learning, measured</p>
        </header>

        <Card>
          <form onSubmit={onSubmit} noValidate>
            <h2 className="font-serif text-h3">{title}</h2>

            {mode === 'claim' && (
              <p className="text-ink-muted text-sm">
                Your teacher registered you. Use the school address they have, and choose a password.
              </p>
            )}
            {mode === 'reset' && (
              <p className="text-ink-muted text-sm">
                We&apos;ll send a link to set a new password.
              </p>
            )}

            <TextField
              id="door-email"
              label={en.door.email}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {mode !== 'reset' && (
              <TextField
                id="door-password"
                label={en.door.password}
                type="password"
                name="password"
                autoComplete={mode === 'claim' ? 'new-password' : 'current-password'}
                required
                hint={mode === 'claim' ? `At least ${MIN_PASSWORD} characters` : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}

            {error && (
              <p className="pl-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="pl-hint" role="status">
                {notice}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" block disabled={busy}>
              {busy ? '…' : title}
            </Button>
          </form>
        </Card>

        <nav className="flex flex-col items-center gap-2 text-sm">
          {mode !== 'claim' && (
            <button type="button" className="pl-btn pl-btn--ghost" onClick={() => switchTo('claim')}>
              {en.door.firstVisit}
            </button>
          )}
          {mode !== 'signin' && (
            <button type="button" className="pl-btn pl-btn--ghost" onClick={() => switchTo('signin')}>
              {en.door.signIn}
            </button>
          )}
          {mode !== 'reset' && (
            <button type="button" className="pl-btn pl-btn--ghost" onClick={() => switchTo('reset')}>
              {en.door.forgot}
            </button>
          )}
        </nav>
      </main>
    </div>
  )
}

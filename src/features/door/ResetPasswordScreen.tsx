import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../app/session'
import { PulseError } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, Ground, TextField } from '../../ui/pulse-ui-kit/react'
import { MIN_PASSWORD } from './password'

/**
 * Where the reset link lands. The link signs the person in for one purpose —
 * choosing a new password — so this screen shows whatever the session is.
 * Mobile-first, like the rest of the door.
 */
export function ResetPasswordScreen() {
  const { repo } = useSession()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setLinkInvalid(false)
    if (password.length < MIN_PASSWORD) {
      setError(en.door.passwordTooShort(MIN_PASSWORD))
      return
    }
    setBusy(true)
    try {
      await repo.auth.updatePassword(password)
      setDone(true)
    } catch (e) {
      setError(e instanceof PulseError ? messageForError(e.code) : en.common.error)
      // A dead link cannot be mended here: the way forward is a new one, asked for at the door.
      setLinkInvalid(e instanceof PulseError && e.code === 'RESET_LINK_INVALID')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pl-app">
      <Ground />
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="font-serif text-h2">Pulse</h1>
        </header>
        <Card>
          {done ? (
            <>
              <p role="status">{en.door.passwordChanged}</p>
              <Link to="/" className="pl-btn pl-btn--primary pl-btn--lg pl-btn--block">
                {en.door.continue}
              </Link>
            </>
          ) : (
            <form onSubmit={onSubmit} noValidate>
              <h2 className="font-serif text-h3">{en.door.setNewPassword}</h2>
              <TextField
                id="new-password"
                label={en.door.newPassword}
                type="password"
                autoComplete="new-password"
                required
                hint={en.door.passwordTooShort(MIN_PASSWORD)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p className="pl-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" block disabled={busy}>
                {busy ? '…' : en.door.setNewPassword}
              </Button>
            </form>
          )}
        </Card>

        {linkInvalid && (
          <nav className="flex flex-col items-center gap-2 text-sm">
            <Link to="/" className="pl-btn pl-btn--ghost">
              {en.door.backToSignIn}
            </Link>
          </nav>
        )}
      </main>
    </div>
  )
}

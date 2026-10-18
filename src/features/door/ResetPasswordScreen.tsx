import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../app/session'
import { PulseError } from '../../data/types'
import { en, messageForError } from '../../i18n/en'
import { Button, Card, Ground, TextField } from '../../ui/pulse-ui-kit/react'

const MIN_PASSWORD = 8

/**
 * Where the reset link lands. The link signs the person in for one purpose —
 * choosing a new password — so this screen shows whatever the session is.
 * Mobile-first, like the rest of the door.
 */
export function ResetPasswordScreen() {
  const { repo } = useSession()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
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
      </main>
    </div>
  )
}

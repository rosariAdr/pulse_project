import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '../../app/session'
import { DEMO_PASSWORD } from '../../data/demoData'
import { createFakeRepo } from '../../data/fakeRepo'
import { DoorScreen } from './DoorScreen'

function renderDoor() {
  const repo = createFakeRepo()
  render(
    <SessionProvider repo={repo}>
      <DoorScreen />
    </SessionProvider>,
  )
  return { repo, user: userEvent.setup() }
}

describe('the door', () => {
  it('signs a student in', async () => {
    const { repo, user } = renderDoor()

    await user.type(screen.getByLabelText(/school email/i), 'l.fontaine@idrac.example')
    await user.type(screen.getByLabelText(/password/i), DEMO_PASSWORD)
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(async () => {
      expect((await repo.auth.current())?.name).toBe('Léa Fontaine')
    })
  })

  it('says so when the email and password do not match', async () => {
    const { user } = renderDoor()

    await user.type(screen.getByLabelText(/school email/i), 'l.fontaine@idrac.example')
    await user.type(screen.getByLabelText(/password/i), 'not-the-password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i)
  })

  it('refuses an email nobody registered, in words a student can act on', async () => {
    const { user } = renderDoor()

    await user.click(screen.getByRole('button', { name: /first time here/i }))
    await user.type(screen.getByLabelText(/school email/i), 'stranger@nowhere.example')
    await user.type(screen.getByLabelText(/password/i), 'long-enough-password')
    await user.click(screen.getByRole('button', { name: /create my password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no Pulse profile/i)
  })

  it('asks for a long enough password before calling the database', async () => {
    const { user } = renderDoor()

    await user.click(screen.getByRole('button', { name: /first time here/i }))
    await user.type(screen.getByLabelText(/school email/i), 'a.benkirane@idrac.example')
    await user.type(screen.getByLabelText(/password/i), 'short')
    await user.click(screen.getByRole('button', { name: /create my password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8 characters/i)
  })

  it('never says whether an email exists when asking for a reset link', async () => {
    const { user } = renderDoor()

    await user.click(screen.getByRole('button', { name: /forgot your password/i }))
    await user.type(screen.getByLabelText(/school email/i), 'stranger@nowhere.example')
    await user.click(screen.getByRole('button', { name: /send me a reset link/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/if this email has a Pulse profile/i)
  })

  it('lets a registered student claim their profile on the first visit', async () => {
    const { repo, user } = renderDoor()
    await repo.auth.signOut()

    // Aya exists as a profile; give her a brand new account.
    repo.state.accounts = repo.state.accounts.filter((a) => a.email !== 'a.benkirane@idrac.example')

    await user.click(screen.getByRole('button', { name: /first time here/i }))
    await user.type(screen.getByLabelText(/school email/i), 'a.benkirane@idrac.example')
    await user.type(screen.getByLabelText(/password/i), 'a-good-password')
    await user.click(screen.getByRole('button', { name: /create my password/i }))

    await waitFor(async () => {
      expect((await repo.auth.current())?.name).toBe('Aya Benkirane')
    })
  })
})

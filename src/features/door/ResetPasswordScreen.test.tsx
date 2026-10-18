import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '../../app/session'
import { DEMO_PASSWORD } from '../../data/demoData'
import { createFakeRepo } from '../../data/fakeRepo'
import { ResetPasswordScreen } from './ResetPasswordScreen'

const LEA = 'l.fontaine@idrac.example'

async function renderScreen({ signedIn }: { signedIn: boolean }) {
  const repo = createFakeRepo()
  if (signedIn) await repo.auth.signIn(LEA, DEMO_PASSWORD) // what the reset link does
  render(
    <SessionProvider repo={repo}>
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPasswordScreen />
      </MemoryRouter>
    </SessionProvider>,
  )
  return { repo, user: userEvent.setup() }
}

describe('the new-password screen', () => {
  it('sets the new password and says so', async () => {
    const { repo, user } = await renderScreen({ signedIn: true })

    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password')
    await user.click(screen.getByRole('button', { name: 'Set my new password' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your password is changed')
    await repo.auth.signOut()
    expect((await repo.auth.signIn(LEA, 'a-brand-new-password')).email).toBe(LEA)
  })

  it('asks for a long enough password before calling anything', async () => {
    const { user } = await renderScreen({ signedIn: true })

    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Set my new password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters')
  })

  it('says the link is no longer valid when nobody is signed in', async () => {
    const { user } = await renderScreen({ signedIn: false })

    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password')
    await user.click(screen.getByRole('button', { name: 'Set my new password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('expired or was already used')
  })
})

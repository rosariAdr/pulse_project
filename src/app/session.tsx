import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PulseRepo } from '../data/repo'
import type { Viewer } from '../data/types'

/**
 * Who is signed in, for the whole app. The repo is passed in rather than
 * imported, so tests and the preview can run on the in-memory implementation.
 */
type SessionValue = {
  repo: PulseRepo
  viewer: Viewer | null
  /** True until the first read of the current session has finished. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<Viewer>
  claimProfile: (email: string, password: string) => Promise<Viewer>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ repo, children }: { repo: PulseRepo; children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    repo.auth
      .current()
      .then((v) => {
        if (!cancelled) setViewer(v)
      })
      .catch(() => {
        if (!cancelled) setViewer(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repo])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const v = await repo.auth.signIn(email, password)
      setViewer(v)
      return v
    },
    [repo],
  )

  const claimProfile = useCallback(
    async (email: string, password: string) => {
      const v = await repo.auth.claimProfile(email, password)
      setViewer(v)
      return v
    },
    [repo],
  )

  const signOut = useCallback(async () => {
    await repo.auth.signOut()
    setViewer(null)
  }, [repo])

  const value = useMemo<SessionValue>(
    () => ({ repo, viewer, loading, signIn, claimProfile, signOut }),
    [repo, viewer, loading, signIn, claimProfile, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside a SessionProvider')
  return value
}

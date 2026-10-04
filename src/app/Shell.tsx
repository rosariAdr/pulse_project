import { BookOpen, ListChecks, LogOut, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { usingFakeData } from '../data'
import { en } from '../i18n/en'
import { AppShell, Button, StatusPill } from '../ui/pulse-ui-kit/react'
import { useTheme } from '../ui/pulse-ui-kit/react'
import { useSession } from './session'

/** The signed-in frame: navigation for the viewer's role, theme, sign out. */
export function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { viewer, signOut } = useSession()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (!viewer) return null

  const nav =
    viewer.kind === 'student'
      ? [
          {
            href: '/modules',
            label: en.nav.myModules,
            icon: <BookOpen size={18} aria-hidden />,
            current: pathname.startsWith('/modules'),
          },
        ]
      : [
          {
            href: '/teacher',
            label: en.nav.myModules,
            icon: <BookOpen size={18} aria-hidden />,
            current: pathname === '/teacher',
          },
          {
            href: '/teacher',
            label: en.nav.rawResults,
            icon: <ListChecks size={18} aria-hidden />,
            current: pathname.startsWith('/teacher/'),
          },
        ]

  return (
    <AppShell
      nav={nav}
      crumb="Pulse"
      title={title}
      user={{
        initials: viewer.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
        name: viewer.name,
        context: viewer.kind === 'master' ? 'Admin + teacher' : viewer.email,
      }}
      topbarEnd={
        <div className="flex items-center gap-2">
          {/* On a phone the page title owns the top bar: the demo badge waits for room. */}
          {usingFakeData && (
            <span className="hidden sm:inline-flex">
              <StatusPill tone="neutral">{en.common.demoData}</StatusPill>
            </span>
          )}
          <Button
            icon
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
          </Button>
          <Button
            icon
            aria-label={en.nav.signOut}
            onClick={async () => {
              await signOut()
              navigate('/', { replace: true })
            }}
          >
            <LogOut size={18} aria-hidden />
          </Button>
        </div>
      }
    >
      {children}
    </AppShell>
  )
}

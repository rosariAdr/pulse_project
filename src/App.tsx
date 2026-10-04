import { Activity, BookOpen, House, ListChecks, Moon, Sun } from 'lucide-react'
import { en } from './i18n/en'
import {
  AppShell,
  Button,
  Card,
  Panel,
  StatusPill,
  Tile,
  useTheme,
} from './ui/pulse-ui-kit/react'

/**
 * Placeholder landing screen. It exists to prove the design system is wired
 * (shell, ground, glass, both themes, the i18n strings) — the real screens are
 * built from the approved mockups in /design, journey by journey.
 */
function App() {
  const { theme, toggleTheme } = useTheme()

  const nav = [
    { href: '#', label: en.nav.home, icon: <House size={18} aria-hidden />, current: true },
    { href: '#', label: en.nav.myModules, icon: <BookOpen size={18} aria-hidden /> },
    { href: '#', label: en.nav.rawResults, icon: <ListChecks size={18} aria-hidden /> },
  ]

  return (
    <AppShell
      nav={nav}
      crumb="Pulse"
      title="V0 in construction"
      user={{ initials: 'PK', name: 'Demo master account', context: 'Admin + teacher' }}
      topbarEnd={
        <Button
          icon
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </Button>
      }
    >
      <Panel>
        <StatusPill tone="neutral">{en.common.demoData}</StatusPill>
        <h1 className="font-serif text-display">Pulse</h1>
        <p className="max-w-xl">
          The entrance-test loop comes next: the door, a test per module, and the
          teacher&apos;s raw results.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Tile k="Theme" v={theme === 'dark' ? 'Dark' : 'Light'} meta="hybrid / dark" />
          <Tile k="Database" v="v10" unit="schema" meta="36 RLS assertions" />
          <Tile k="Journeys approved" v="0" unit="/ 3" meta="see /design" />
        </div>
      </Panel>

      <Card className="mt-6">
        <h2 className="font-serif text-h3">
          <Activity size={18} aria-hidden /> Next step
        </h2>
        <p className="text-ink-muted">
          Export journey 1 (student test day, 390px) to <code>design/01-test-day/</code>,
          then the data layer in <code>src/data/</code>.
        </p>
      </Card>
    </AppShell>
  )
}

export default App

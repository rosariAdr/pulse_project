import { Navigate, Route, Routes } from 'react-router'
import { DoorScreen } from '../features/door/DoorScreen'
import { HandedIn } from '../features/student/HandedIn'
import { ModulePage } from '../features/student/ModulePage'
import { MyModules } from '../features/student/MyModules'
import { TestRun } from '../features/student/TestRun'
import { RawResults } from '../features/teacher/RawResults'
import { TeacherModules } from '../features/teacher/TeacherModules'
import { en } from '../i18n/en'
import { Shell } from './Shell'
import { useSession } from './session'

/**
 * V0 has two journeys and one door. A signed-out visitor only ever sees the
 * door; a student never sees a teacher route and the other way round — the
 * screens are gated here for clarity, and by RLS for safety.
 */
export function AppRoutes() {
  const { viewer, loading } = useSession()

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-ink-muted">Loading…</p>
      </main>
    )
  }

  if (!viewer) return <DoorScreen />

  if (viewer.kind === 'student') {
    return (
      <Routes>
        <Route path="/modules" element={<Shell title={en.nav.myModules}><MyModules /></Shell>} />
        <Route path="/modules/:moduleId" element={<Shell title="Module"><ModulePage /></Shell>} />
        <Route path="/modules/:moduleId/test" element={<Shell title="Entrance test"><TestRun /></Shell>} />
        <Route path="/modules/:moduleId/handed-in" element={<Shell title="Entrance test"><HandedIn /></Shell>} />
        <Route path="*" element={<Navigate to="/modules" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/teacher" element={<Shell title={en.nav.myModules}><TeacherModules /></Shell>} />
      <Route path="/teacher/:moduleId" element={<Shell title={en.nav.rawResults}><RawResults /></Shell>} />
      <Route path="*" element={<Navigate to="/teacher" replace />} />
    </Routes>
  )
}

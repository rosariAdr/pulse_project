import { Activity } from 'lucide-react'

function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Activity className="h-10 w-10 text-gold" aria-hidden />
      <h1 className="text-3xl font-semibold">Pulse</h1>
      <p className="text-ink/70">
        V0 in construction — the door, the entrance test and the results come next.
      </p>
    </main>
  )
}

export default App

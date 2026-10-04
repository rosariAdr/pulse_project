import { BrowserRouter } from 'react-router'
import { AppRoutes } from './app/AppRoutes'
import { SessionProvider } from './app/session'
import { repo } from './data'

function App() {
  return (
    <BrowserRouter>
      <SessionProvider repo={repo}>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  )
}

export default App

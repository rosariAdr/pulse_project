import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ui/pulse-ui-kit/react'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider initial="hybrid">
      <App />
    </ThemeProvider>
  </StrictMode>,
)

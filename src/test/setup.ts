import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library's own auto-cleanup never
// registers: without this, each test renders on top of the previous document.
afterEach(cleanup)

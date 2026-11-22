import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    css: false,
    // Component tests type through user-event, which re-renders the screen at
    // every keystroke. On a slow Windows machine running several worktrees'
    // gates at once they took up to 8 s, and the 5 s default turned the gate red
    // at random (PU-14). 15 s keeps the margin without hiding a hung test.
    testTimeout: 15_000,
    // Unit and component tests only. The e2e/ folder belongs to Playwright.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '**/*.integration.test.ts'],
  },
})

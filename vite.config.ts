import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Bind IPv4 explicitly: by default Vite listens on [::1] only, which the
  // preview browser and curl on this machine cannot reach.
  server: { host: '127.0.0.1', port: 5173 },
})

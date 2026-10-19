import { execFileSync } from 'node:child_process'
import type { TestProject } from 'vitest/node'

/**
 * Reads the local stack's URL and public key from `supabase status`. The local
 * keys are the CLI's fixed demo keys, never a project's; the service_role key
 * that `status` also prints is ignored.
 */
export default function setup(project: TestProject) {
  let raw: string
  try {
    raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    throw new Error('The local Supabase stack is not running. Start Docker, then `npm run db:start`.')
  }
  const status = JSON.parse(raw) as Record<string, string | undefined>
  const url = status.API_URL
  const key = status.ANON_KEY ?? status.PUBLISHABLE_KEY
  if (!url || !key) throw new Error('`supabase status` returned no API URL or anon key.')
  project.provide('supabase', { url, key })
}

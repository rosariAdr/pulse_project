// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findSecrets } from './secrets.mjs'

// Fixtures are built at runtime so this file never contains a real-looking secret
// (the scanner runs on the repository, including this file).
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${'s'.repeat(43)}`

describe('findSecrets', () => {
  it('flags a service_role key', () => {
    const found = findSecrets('src/x.ts', `const k = '${jwt({ role: 'service_role', iss: 'supabase' })}'`)
    expect(found).toEqual([{ path: 'src/x.ts', line: 1, reason: 'a Supabase service_role key' }])
  })

  it('lets the anon key through — it is public by design', () => {
    expect(findSecrets('src/x.ts', `const k = '${jwt({ role: 'anon', iss: 'supabase' })}'`)).toEqual([])
  })

  it('flags a Supabase secret key', () => {
    const key = 'sb_' + 'secret_' + 'a'.repeat(20)
    expect(findSecrets('a.md', `key: ${key}`)[0].reason).toBe('a Supabase secret key')
  })

  it('flags a database password for a remote host', () => {
    const url = 'postgresql://postgres.abc:' + 'hunter2hunter2' + '@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
    expect(findSecrets('notes.txt', `DB=${url}`)[0].reason).toBe('a database password')
  })

  it('ignores the local stack and placeholders', () => {
    const local = 'postgresql://postgres:' + 'postgres' + '@127.0.0.1:54322/postgres'
    const placeholder = 'postgresql://postgres:[YOUR-PASSWORD]@db.example.supabase.co:5432/postgres'
    expect(findSecrets('a.md', `${local}\n${placeholder}`)).toEqual([])
  })

  it('flags a tracked env file but not the example', () => {
    expect(findSecrets('.env.local', 'VITE_SUPABASE_URL=x')[0].reason).toBe('an env file is tracked')
    expect(findSecrets('.env.example', 'VITE_SUPABASE_URL=')).toEqual([])
  })

  it('reports the line, never the value', () => {
    const [finding] = findSecrets('src/x.ts', `ok\nok\nconst k = '${jwt({ role: 'service_role' })}'`)
    expect(finding.line).toBe(3)
    expect(JSON.stringify(finding)).not.toContain('eyJ')
  })
})

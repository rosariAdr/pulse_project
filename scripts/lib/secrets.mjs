/**
 * Finds what must never be committed. Pure: a path and its text in, findings out.
 * A finding names the file, the line and the kind of secret — never the value.
 */
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{8,}/
const DB_URL = /postgres(?:ql)?:\/\/[^:\s/@]+:([^@\s]+)@([^/\s:]+)/g
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', 'db', 'host.docker.internal'])

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

const isPlaceholder = (password) => password.startsWith('[') || password.startsWith('$') || password.startsWith('<')

export function findSecrets(path, text) {
  const findings = []
  const base = path.split('/').pop() ?? path

  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) {
    findings.push({ path, line: 0, reason: 'an env file is tracked' })
  }

  text.split('\n').forEach((content, index) => {
    const line = index + 1
    for (const match of content.matchAll(JWT)) {
      if (jwtRole(match[0]) === 'service_role') {
        findings.push({ path, line, reason: 'a Supabase service_role key' })
      }
    }
    if (SECRET_KEY.test(content)) findings.push({ path, line, reason: 'a Supabase secret key' })
    for (const match of content.matchAll(DB_URL)) {
      const [, password, host] = match
      if (!LOCAL_HOSTS.has(host) && !isPlaceholder(password)) {
        findings.push({ path, line, reason: 'a database password' })
      }
    }
  })

  return findings
}

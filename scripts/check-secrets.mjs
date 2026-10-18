#!/usr/bin/env node
/**
 * Fails when a tracked file holds a secret. Runs in CI on every PR and in
 * `npm run verify`. Prints where, never what.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { findSecrets } from './lib/secrets.mjs'

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const findings = []

for (const path of files) {
  try {
    if (statSync(path).size > 1_000_000) continue
  } catch {
    continue
  }
  findings.push(...findSecrets(path, readFileSync(path, 'utf8')))
}

if (findings.length > 0) {
  console.error('Secrets in tracked files. Remove them, rotate them in Supabase, then push again:')
  for (const f of findings) console.error(`  ${f.path}:${f.line}  ${f.reason}`)
  process.exit(1)
}
console.log(`No secrets in ${files.length} tracked files.`)

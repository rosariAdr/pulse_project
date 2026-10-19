#!/usr/bin/env node
/**
 * Turns a spreadsheet into the SQL that provisions a real class.
 *
 * V0 has no master screens: this script replaces them. Parv fills in one CSV,
 * this writes the inserts, and you run them against the right project.
 *
 *   node scripts/provision.mjs [--staff "Full Name <email>"]... classes.csv > provision.sql
 *   # read provision.sql, then paste it into the Supabase SQL editor
 *
 * `--staff`, once per founder, creates their master account first. Sign-up is
 * refused for any address without a staff or student row, so an empty project
 * needs it once; the SQL refuses to run while no master account exists.
 *
 * The CSV columns, header row required:
 *   institution,class,level,student_name,student_email,module_code,module_title,module_language,session_count
 *
 * One row per student. The class, institution and module repeat on every row of
 * that class — that is what makes the file easy to fill in by hand.
 *
 * It prints SQL and never connects to anything: nothing is provisioned until a
 * human reads the output and runs it. Student names and emails are personal
 * data, so the file you feed it does not belong in the repository. The logic
 * lives in scripts/lib/provision.mjs; this file only reads, calls and prints.
 */

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parseCsv, parseStaff, toSql, validate } from './lib/provision.mjs'

const USAGE = 'Usage: node scripts/provision.mjs [--staff "Full Name <email>"]... <file.csv> > provision.sql'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function main() {
  let args
  try {
    args = parseArgs({ options: { staff: { type: 'string', multiple: true } }, allowPositionals: true })
  } catch (error) {
    fail(`${error.message}\n${USAGE}`)
  }

  const [path, ...extra] = args.positionals
  if (!path || extra.length > 0) fail(USAGE)

  const records = parseCsv(readFileSync(path, 'utf8'))
  const { staff, problems: staffProblems } = parseStaff(args.values.staff ?? [])
  const problems = [...staffProblems, ...validate(records)]

  if (problems.length > 0) {
    fail('Nothing was written. Fix these first:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  }

  console.log(toSql({ records, staff }))
}

main()

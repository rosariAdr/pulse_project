/**
 * The provisioning script's logic, as pure functions: text and arguments in,
 * records, problems and SQL out. `scripts/provision.mjs` only reads the file,
 * calls these and prints. Nothing here connects to anything.
 */

const REQUIRED = ['institution', 'class', 'student_name', 'student_email', 'module_code', 'module_title']

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const STAFF = /^\s*([^<>]*?)\s*<\s*([^<>]*?)\s*>\s*$/
const NO_ROWS = 'the file has no student rows: a header row, then one row per student'

/**
 * Minimal CSV reader: quoted fields, doubled quotes, commas and newlines inside
 * them. The first row that is not blank is the header; blank rows are ignored.
 * Each record is keyed by the header (trimmed, lower-cased), its cells trimmed,
 * and carries `line`: the line of the file its row starts on.
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let line = 1
  let rowLine = 1

  const endRow = () => {
    row.push(field)
    rows.push({ line: rowLine, cells: row })
    row = []
    field = ''
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\n') line++
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      endRow()
      rowLine = line
    } else if (c !== '\r') field += c
  }
  if (field !== '' || row.length > 0) endRow()

  const [header, ...body] = rows.filter((r) => r.cells.some((cell) => cell.trim() !== ''))
  if (!header) return []
  const columns = header.cells.map((h) => h.trim().toLowerCase())

  return body.map(({ line: start, cells }) => ({
    ...Object.fromEntries(columns.map((column, i) => [column, (cells[i] ?? '').trim()])),
    line: start,
  }))
}

/** Everything wrong with the records, each named by its line. Empty means good to go. */
export function validate(records) {
  if (records.length === 0) return [NO_ROWS]

  const missing = REQUIRED.filter((column) => !(column in records[0]))
  if (missing.length > 0) return [`the header row is missing column(s): ${missing.join(', ')}`]

  const problems = []
  const seen = new Map()
  for (const record of records) {
    const { line } = record
    for (const column of REQUIRED) {
      if (!record[column]) problems.push(`line ${line}: ${column} is empty`)
    }
    if (record.student_email && !EMAIL.test(record.student_email)) {
      problems.push(`line ${line}: "${record.student_email}" does not look like an email`)
    }
    // The same address twice in one class would collide with the database's
    // unique (class_id, email) — better to hear it now than from a constraint.
    const key = `${record.class}|${record.student_email.toLowerCase()}`
    if (seen.has(key)) {
      problems.push(`line ${line}: ${record.student_email} is already in ${record.class} (line ${seen.get(key)})`)
    } else seen.set(key, line)
  }
  return problems
}

/**
 * The founders' master accounts, from the `--staff "Full Name <email>"` values.
 * Sign-up is refused for an address without a staff or student row, so on an
 * empty project these are what let the founders in.
 */
export function parseStaff(args) {
  const staff = []
  const problems = []
  const seen = new Map()
  for (const arg of args) {
    const named = `--staff "${arg}"`
    const match = STAFF.exec(arg)
    if (!match || !match[1]) {
      problems.push(`${named}: write it as "Full Name <email>"`)
      continue
    }
    const [, name, email] = match
    if (!EMAIL.test(email)) {
      problems.push(`${named}: "${email}" does not look like an email`)
      continue
    }
    const key = email.toLowerCase() // staff_accounts.email is citext
    if (seen.has(key)) {
      problems.push(`${named}: ${email} is already given (--staff "${seen.get(key)}")`)
      continue
    }
    seen.set(key, arg)
    staff.push({ name, email })
  }
  return { staff, problems }
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`

/** The SQL a person reads, then runs against one project. One transaction. */
export function toSql({ records, staff = [] }) {
  const classes = new Map() // "institution|class" → { institution, name, level, students[] }
  const modules = new Map() // code → { code, title, language, sessionCount, classes:Set }

  for (const record of records) {
    const classKey = `${record.institution}|${record.class}`
    if (!classes.has(classKey)) {
      classes.set(classKey, {
        institution: record.institution,
        name: record.class,
        level: record.level || null,
        students: [],
      })
    }
    classes.get(classKey).students.push({ name: record.student_name, email: record.student_email })

    if (!modules.has(record.module_code)) {
      modules.set(record.module_code, {
        code: record.module_code,
        title: record.module_title,
        language: (record.module_language || 'en').toLowerCase(),
        sessionCount: Number(record.session_count || 0),
        classes: new Set(),
      })
    }
    modules.get(record.module_code).classes.add(classKey)
  }

  const out = []
  out.push('-- Generated by scripts/provision.mjs. Read it before you run it.')
  out.push(`-- ${classes.size} class(es), ${records.length} student profile(s), ${modules.size} module(s).`)
  out.push('-- Run it against ONE project (dev or prod), signed in as the master account.')
  out.push('begin;')
  out.push('')

  if (staff.length > 0) {
    out.push(`-- The founders' master accounts (${staff.length}). Each signs up with this exact address.`)
    for (const person of staff) {
      out.push('insert into public.staff_accounts (email, display_name)')
      out.push(`values (${quote(person.email)}, ${quote(person.name)})`)
      out.push('on conflict (email) do nothing;')
    }
    out.push('')
  }

  const classVar = (key) => `v_class_${[...classes.keys()].indexOf(key) + 1}`
  const moduleVar = (code) => `v_module_${[...modules.keys()].indexOf(code) + 1}`

  out.push('do $$')
  out.push('declare')
  for (const key of classes.keys()) out.push(`  ${classVar(key)} uuid;`)
  for (const code of modules.keys()) out.push(`  ${moduleVar(code)} uuid;`)
  out.push('  v_master uuid;')
  out.push('begin')
  out.push("  select id into v_master from public.staff_accounts where role = 'master' order by created_at limit 1;")
  out.push('  if v_master is null then')
  out.push(
    `    raise exception 'PULSE_NO_MASTER: create the founders'' staff accounts first (--staff "Name <email>")';`,
  )
  out.push('  end if;')
  out.push('')

  for (const [key, klass] of classes) {
    out.push(`  -- ${klass.institution} · ${klass.name}`)
    out.push('  insert into public.classes (name, institution, level, created_by)')
    out.push(
      `  values (${quote(klass.name)}, ${quote(klass.institution)}, ${klass.level ? quote(klass.level) : 'null'}, v_master)`,
    )
    out.push(`  returning id into ${classVar(key)};`)
    out.push('')
    for (const student of klass.students) {
      out.push('  insert into public.student_profiles (class_id, full_name, email)')
      out.push(`  values (${classVar(key)}, ${quote(student.name)}, ${quote(student.email)})`)
      out.push('  on conflict (class_id, email) do nothing;')
    }
    out.push('')
  }

  for (const [code, mod] of modules) {
    out.push(`  -- ${code} · ${mod.title}`)
    out.push('  insert into public.modules (code, title, language, session_count, created_by)')
    out.push(
      `  values (${quote(code)}, ${quote(mod.title)}, ${quote(mod.language)}, ${mod.sessionCount}, v_master)`,
    )
    out.push(`  returning id into ${moduleVar(code)};`)
    for (const classKey of mod.classes) {
      out.push('  insert into public.class_modules (class_id, module_id)')
      out.push(`  values (${classVar(classKey)}, ${moduleVar(code)}) on conflict do nothing;`)
    }
    out.push('')
  }

  out.push('end $$;')
  out.push('')
  out.push('commit;')
  out.push('')
  out.push('-- After this: sign in to Pulse as the master account, open the module,')
  out.push('-- write the entrance test and publish it. Students then create their')
  out.push('-- account with the exact address listed above — any other is refused.')

  return out.join('\n')
}

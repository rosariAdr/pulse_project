// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCsv, parseStaff, toSql, validate } from './provision.mjs'

// Fictional data only (.example addresses), like the rest of the repository.
const HEADER =
  'institution,class,level,student_name,student_email,module_code,module_title,module_language,session_count'
const row = (overrides = {}) => {
  const values = {
    institution: 'IDRAC Toulouse',
    class: 'B1 · Groupe 2',
    level: 'B1',
    student_name: 'Léa Fontaine',
    student_email: 'l.fontaine@idrac.example',
    module_code: 'ST',
    module_title: 'Statistiques commerciales',
    module_language: 'fr',
    session_count: '8',
    ...overrides,
  }
  return HEADER.split(',')
    .map((column) => values[column])
    .join(',')
}
const csv = (...rows) => [HEADER, ...rows].join('\n') + '\n'

describe('parseCsv', () => {
  it('keys each record by the header and keeps the line it starts on', () => {
    const records = parseCsv(csv(row()))
    expect(records).toEqual([
      {
        line: 2,
        institution: 'IDRAC Toulouse',
        class: 'B1 · Groupe 2',
        level: 'B1',
        student_name: 'Léa Fontaine',
        student_email: 'l.fontaine@idrac.example',
        module_code: 'ST',
        module_title: 'Statistiques commerciales',
        module_language: 'fr',
        session_count: '8',
      },
    ])
  })

  it('reads a quoted field that holds a comma', () => {
    const [record] = parseCsv('institution,class\nIDRAC Toulouse,"B1, Groupe 2"\n')
    expect(record.class).toBe('B1, Groupe 2')
  })

  it('turns a doubled quote into one quote', () => {
    const [record] = parseCsv('student_name\n"Léa ""Lou"" Fontaine"\n')
    expect(record.student_name).toBe('Léa "Lou" Fontaine')
  })

  it('keeps a newline inside quotes, and counts it for the next line number', () => {
    const records = parseCsv('institution,class\n"IDRAC\nToulouse",B1\nABS Paris,M2-03\n')
    expect(records.map((r) => r.institution)).toEqual(['IDRAC\nToulouse', 'ABS Paris'])
    expect(records.map((r) => r.line)).toEqual([2, 4])
  })

  it('ignores blank lines, including Windows line endings', () => {
    const records = parseCsv('institution,class\r\n\r\nIDRAC Toulouse,B1\r\n   \r\nABS Paris,M2-03\r\n\r\n')
    expect(records).toEqual([
      { line: 3, institution: 'IDRAC Toulouse', class: 'B1' },
      { line: 5, institution: 'ABS Paris', class: 'M2-03' },
    ])
  })

  it('trims cells and lower-cases the header, so a spreadsheet export reads as typed', () => {
    const [record] = parseCsv(' Institution , CLASS \n  IDRAC Toulouse  ,B1\n')
    expect(record).toEqual({ line: 2, institution: 'IDRAC Toulouse', class: 'B1' })
  })

  it('reads an empty file as no records', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('validate', () => {
  it('accepts a well-formed file', () => {
    expect(validate(parseCsv(csv(row(), row({ student_name: 'Yanis Cherif', student_email: 'y.cherif@idrac.example' }))))).toEqual([])
  })

  it('reports a bad email with its line number', () => {
    const problems = validate(parseCsv(csv(row(), row({ student_email: 'y.cherif-at-idrac.example' }))))
    expect(problems).toEqual(['line 3: "y.cherif-at-idrac.example" does not look like an email'])
  })

  it('reports a required value left empty with its line number', () => {
    const problems = validate(parseCsv(csv(row(), row({ student_name: '', student_email: 'y.cherif@idrac.example' }))))
    expect(problems).toEqual(['line 3: student_name is empty'])
  })

  it('reports a required column missing from the header, once, without a complaint per line', () => {
    const text = 'institution,class,student_name,module_code,module_title\nIDRAC Toulouse,B1,Léa Fontaine,ST,Stats\nIDRAC Toulouse,B1,Yanis Cherif,ST,Stats\n'
    expect(validate(parseCsv(text))).toEqual(['the header row is missing column(s): student_email'])
  })

  it('reports the same student twice in a class with both line numbers, whatever the case', () => {
    const problems = validate(
      parseCsv(csv(row(), row({ student_name: 'Yanis Cherif', student_email: 'y.cherif@idrac.example' }), row({ student_email: 'L.Fontaine@idrac.example' }))),
    )
    expect(problems).toEqual(['line 4: L.Fontaine@idrac.example is already in B1 · Groupe 2 (line 2)'])
  })

  it('lets the same student sit in two classes', () => {
    expect(validate(parseCsv(csv(row(), row({ class: 'B1 · Groupe 3' }))))).toEqual([])
  })

  it('refuses a file with no student rows', () => {
    expect(validate(parseCsv(''))).toEqual(['the file has no student rows: a header row, then one row per student'])
    expect(validate(parseCsv(HEADER + '\n'))).toEqual(['the file has no student rows: a header row, then one row per student'])
  })
})

describe('parseStaff', () => {
  it('reads "Full Name <email>"', () => {
    expect(parseStaff(['Adrian Rosari <adrian@pulse.example>'])).toEqual({
      staff: [{ name: 'Adrian Rosari', email: 'adrian@pulse.example' }],
      problems: [],
    })
  })

  it('reads several founders, in order', () => {
    expect(parseStaff(['Adrian Rosari <adrian@pulse.example>', '  Parv Kaur<parv@pulse.example> ']).staff).toEqual([
      { name: 'Adrian Rosari', email: 'adrian@pulse.example' },
      { name: 'Parv Kaur', email: 'parv@pulse.example' },
    ])
  })

  it('takes no founder when none is given', () => {
    expect(parseStaff([])).toEqual({ staff: [], problems: [] })
  })

  it('refuses a value without <…>, naming the argument', () => {
    expect(parseStaff(['adrian@pulse.example'])).toEqual({
      staff: [],
      problems: ['--staff "adrian@pulse.example": write it as "Full Name <email>"'],
    })
  })

  it('refuses a value with no name', () => {
    expect(parseStaff(['<adrian@pulse.example>']).problems).toEqual([
      '--staff "<adrian@pulse.example>": write it as "Full Name <email>"',
    ])
  })

  it('refuses a bad email, naming the argument', () => {
    expect(parseStaff(['Adrian Rosari <adrian-at-pulse.example>']).problems).toEqual([
      '--staff "Adrian Rosari <adrian-at-pulse.example>": "adrian-at-pulse.example" does not look like an email',
    ])
  })

  it('refuses the same email twice, whatever the case', () => {
    expect(parseStaff(['Adrian Rosari <adrian@pulse.example>', 'A. Rosari <Adrian@Pulse.example>']).problems).toEqual([
      '--staff "A. Rosari <Adrian@Pulse.example>": Adrian@Pulse.example is already given (--staff "Adrian Rosari <adrian@pulse.example>")',
    ])
  })
})

describe('toSql', () => {
  const records = parseCsv(csv(row(), row({ class: 'M2-03', institution: 'ABS Paris', student_email: 'l.benali@abs.example', student_name: 'Lina Benali' })))
  const staff = [
    { name: 'Adrian Rosari', email: 'adrian@pulse.example' },
    { name: 'Parv Kaur', email: 'parv@pulse.example' },
  ]
  const STAFF_INSERT = (email, name) =>
    `insert into public.staff_accounts (email, display_name)\nvalues ('${email}', '${name}')\non conflict (email) do nothing;`

  it('creates each founder before the first class, and before the master is looked up', () => {
    const sql = toSql({ records, staff })
    const adrian = sql.indexOf(STAFF_INSERT('adrian@pulse.example', 'Adrian Rosari'))
    const parv = sql.indexOf(STAFF_INSERT('parv@pulse.example', 'Parv Kaur'))
    expect(adrian).toBeGreaterThan(-1)
    expect(parv).toBeGreaterThan(adrian)
    expect(parv).toBeLessThan(sql.indexOf('select id into v_master'))
    expect(parv).toBeLessThan(sql.indexOf('insert into public.classes'))
  })

  it('refuses to run without a master, right after looking for one', () => {
    const sql = toSql({ records, staff: [] })
    const lookup = "  select id into v_master from public.staff_accounts where role = 'master' order by created_at limit 1;\n"
    const guard =
      '  if v_master is null then\n' +
      `    raise exception 'PULSE_NO_MASTER: create the founders'' staff accounts first (--staff "Name <email>")';\n` +
      '  end if;\n'
    expect(sql).toContain(lookup + guard)
    expect(sql.indexOf(guard)).toBeLessThan(sql.indexOf('insert into public.classes'))
  })

  it('writes no staff insert when no founder is given', () => {
    expect(toSql({ records, staff: [] })).not.toContain('insert into public.staff_accounts')
  })

  it("escapes an apostrophe in a founder's or a student's name", () => {
    const sql = toSql({
      records: parseCsv(csv(row({ student_name: "Siobhan O'Brien" }))),
      staff: [{ name: "Pat O'Brien", email: 'pat@pulse.example' }],
    })
    expect(sql).toContain("values ('pat@pulse.example', 'Pat O''Brien')")
    expect(sql).toContain("'Siobhan O''Brien'")
    expect(sql).not.toMatch(/[^']O'B/)
  })

  it('wraps everything in one transaction', () => {
    const statements = toSql({ records, staff })
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('--'))
    expect(statements[0]).toBe('begin;')
    expect(statements.at(-1)).toBe('commit;')
  })

  it('still provisions the classes, profiles and modules', () => {
    const sql = toSql({ records, staff })
    expect(sql).toContain("values ('B1 · Groupe 2', 'IDRAC Toulouse', 'B1', v_master)")
    expect(sql).toContain("values (v_class_2, 'Lina Benali', 'l.benali@abs.example')")
    expect(sql).toContain("values ('ST', 'Statistiques commerciales', 'fr', 8, v_master)")
    expect(sql).toContain('values (v_class_1, v_module_1) on conflict do nothing;')
    expect(sql).toContain('values (v_class_2, v_module_1) on conflict do nothing;')
  })
})

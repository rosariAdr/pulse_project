export const meta = {
  name: 'pulse-v0-finish',
  description: 'Finish Pulse V0 one wave at a time: each plan task on its own branch, reviewed for scope and for security, verified on every test layer, merged into dev (never main)',
  whenToUse: 'After Task 0 of docs/superpowers/plans/2026-10-18-v0-finish.md is done. Launch with args { wave: "1" | "2a" | "2b" | "3" | "4", decisionLogApproved: true }. Run the waves in order and read each report before the next.',
  phases: [
    { title: 'Preflight', detail: 'the setup, the previous waves, a green dev' },
    { title: 'Build', detail: 'one implementer per task, each in its own worktree' },
    { title: 'Review', detail: 'scope, and security & test integrity — independently' },
    { title: 'Verify', detail: 'every test layer on the branch; database layers one task at a time' },
    { title: 'Merge', detail: 'CI green on the PR, then into dev' },
    { title: 'Final review', detail: 'task 8: three lenses, skeptics, completeness' },
    { title: 'Report', detail: 'what landed, what stopped, what a person must do' },
  ],
}

// ----------------------------------------------------------------- the plan
const PLAN = 'docs/superpowers/plans/2026-10-18-v0-finish.md'
const SPEC = 'docs/superpowers/specs/2026-10-18-v0-finish-design.md'

// kind: 'ci' | 'code' | 'sql' | 'docs' | 'review'
// db: needs the local Supabase stack (serialised); e2e: runs Playwright
const TASKS = {
  1: { id: 1, title: 'CI green on dev', branch: 'fix/ci-green', kind: 'ci', db: true, e2e: true },
  2: { id: 2, title: 'Scope correction: Decision Log + CLAUDE.md', branch: 'docs/v0-scope', kind: 'docs', db: false, e2e: false },
  3: { id: 3, title: 'Guardrails as code', branch: 'chore/guardrails', kind: 'code', db: false, e2e: true },
  4: { id: 4, title: 'New-password screen behind the reset link', branch: 'feat/reset-password', kind: 'code', db: false, e2e: true },
  5: { id: 5, title: 'Database coverage the suites left out', branch: 'test/db-coverage', kind: 'sql', db: true, e2e: false },
  6: { id: 6, title: 'Repository contract, proven against Supabase', branch: 'feat/repo-contract', kind: 'code', db: true, e2e: true },
  7: { id: 7, title: 'Pilot kit', branch: 'docs/pilot-kit', kind: 'docs', db: false, e2e: false },
  8: { id: 8, title: 'Final review and release readiness', kind: 'review' },
}

// Each wave is a list of steps; tasks inside a step run in parallel, steps run in order.
const WAVES = {
  // Task 1 (CI green on dev) was done on 18 Oct — dev 988bf9f, all three jobs green.
  1: [[2, 3]],
  // Wave 2 is split so the work that needs no local Docker can run first (18 Oct:
  // virtualization is off in the firmware of the dev machine).
  "2a": [[4, 7]], // reset-password screen + pilot kit — no database
  "2b": [[5]], // database coverage — needs the local stack
  3: [[6]],
  4: [[8]],
}
const PREVIOUS = { 1: [], "2a": [2, 3], "2b": [2, 3], 3: [2, 3, 4, 5], 4: [2, 3, 4, 5, 6, 7] }
const ORDER = ["1", "2a", "2b", "3", "4"]

// gh and Docker were installed after the app started: their folders are not on the inherited PATH.
const SHELL_SETUP = 'Before any command, run: export PATH="$PATH:/c/Program Files/GitHub CLI:/c/Program Files/Docker/Docker/resources/bin"'

const GUARDRAILS = `
${SHELL_SETUP}
Non-negotiable for this work (the plan's Global Constraints, in full in ${PLAN}):
- Work on your branch, cut from origin/dev; PRs go into dev. Never push or merge to main. Never force-push. Never delete a branch. Never change GitHub, Vercel or Supabase settings.
- Never read, print, use or commit a service_role key or an sb_secret_ key. Check .env.local only with \`grep -c\`, never cat it.
- Schema or RLS change = a NEW migration + a pgTAP test, same PR. Never edit 20261003000000_v10_schema.sql or 20261004120000_v0_hardening.sql. SQL runs against the local stack only — never \`supabase db push\`, never \`supabase link\`.
- Fix code, not tests. A test changes only if it is itself wrong, and the PR says why. No .skip, .only, test.fixme, lowered plan(n), deleted assertions.
- Demo data only (.example addresses). No real student names or emails.
- Commit messages end with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- If you cannot finish without breaking one of these, stop and say so in your result. A task that stops is a good outcome; a task forced through is not.`

// ----------------------------------------------------------------- schemas
const PREFLIGHT = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    blockers: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ready', 'blockers', 'notes'],
}

const IMPL = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['pr-opened', 'nothing-to-do', 'blocked'] },
    branch: { type: 'string' },
    pr_number: { type: 'number' },
    pr_url: { type: 'string' },
    summary: { type: 'string' },
    local_checks: { type: 'string', description: 'commands run and their outcome' },
    blocked_reason: { type: 'string' },
  },
  required: ['status', 'summary'],
}

const REVIEW = {
  type: 'object',
  properties: {
    approve: { type: 'boolean' },
    blocking: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          problem: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['file', 'problem', 'fix'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['approve', 'blocking', 'notes'],
}

const VERIFY = {
  type: 'object',
  properties: {
    green: { type: 'boolean' },
    layers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, ok: { type: 'boolean' }, detail: { type: 'string' } },
        required: ['name', 'ok', 'detail'],
      },
    },
  },
  required: ['green', 'layers'],
}

const FIX = {
  type: 'object',
  properties: { pushed: { type: 'boolean' }, summary: { type: 'string' }, gave_up_reason: { type: 'string' } },
  required: ['pushed', 'summary'],
}

const MERGE = {
  type: 'object',
  properties: { merged: { type: 'boolean' }, reason: { type: 'string' }, ci: { type: 'string' } },
  required: ['merged', 'reason'],
}

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          evidence: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'evidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['refuted', 'reason'],
}

const READINESS = {
  type: 'object',
  properties: {
    done: { type: 'array', items: { type: 'string' } },
    not_done: { type: 'array', items: { type: 'string' } },
    human_actions: { type: 'array', items: { type: 'string' } },
    release_pr_body: { type: 'string' },
    board_updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { card: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } },
        required: ['card', 'status', 'note'],
      },
    },
  },
  required: ['done', 'not_done', 'human_actions', 'release_pr_body', 'board_updates'],
}

// ----------------------------------------------------------------- helpers
// One local Supabase stack is shared by every worktree: database layers run one at a time.
// Merges also run one at a time, so each PR is checked against the dev it lands on.
function makeLock() {
  let tail = Promise.resolve()
  return (fn) => {
    const run = tail.then(fn, fn)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
const withDb = makeLock()
const withMerge = makeLock()

const waveKey = String(args && args.wave)
const wave = parseInt(waveKey, 10) // numeric stage, for the layer rules below
const approved = Boolean(args && args.decisionLogApproved)
const MAX_ROUNDS = 2

function taskText(t) {
  return `Task ${t.id} ("${t.title}") of ${PLAN}. Read that task section in full, the Global Constraints at the top of the plan, and the spec ${SPEC}.`
}

function layersFor(t) {
  const layers = ['npm ci', 'npm run lint', 'npm run typecheck', 'npm test', 'npm run build']
  if (t.id >= 3 || wave >= 2) layers.push('npm run check:secrets (if the script exists on this branch)')
  if (t.e2e) layers.push(`npx playwright test with E2E_PORT=${4300 + t.id * 10} (both projects)`)
  if (t.db) layers.push('npm run db:reset && npm run db:test')
  if (t.id === 6 || wave >= 3) layers.push('npm run test:integration (if the script exists on this branch)')
  return layers
}

// ----------------------------------------------------------------- one task
async function runTask(t) {
  log(`Task ${t.id} — ${t.title}: starting`)

  const impl = await agent(
    `You implement ${taskText(t)}
${t.id === 2 ? `decisionLogApproved = ${approved}. Post Appendix A to the Notion Decision Log only if it is true.` : ''}
${t.kind === 'ci' ? 'If the latest CI run on origin/dev is already green after a re-run, change nothing and return status "nothing-to-do".' : ''}

How:
1. \`git fetch origin\` then \`git switch -C ${t.branch} origin/dev\`. Run \`npm ci\`.
2. Follow the task's steps in order, test-first where the step says so (superpowers:test-driven-development). Show each failing test failing before making it pass.
3. Run the checks the task names, then: ${layersFor(t).join(' · ')}. Nothing is pushed red.
4. Commit with the task's message (filled in with what actually happened), \`git push -u origin ${t.branch}\`, then \`gh pr create --base dev --head ${t.branch}\` with a body that says what changed, why, and which commands verified it.
${GUARDRAILS}

Return the PR number and URL, or why you stopped.`,
    { label: `build:${t.id}`, phase: 'Build', isolation: 'worktree', schema: IMPL },
  )

  if (!impl) return { task: t.id, title: t.title, status: 'stopped', reason: 'implementer did not return' }
  if (impl.status === 'nothing-to-do') return { task: t.id, title: t.title, status: 'nothing-to-do', reason: impl.summary }
  if (impl.status === 'blocked' || !impl.pr_number) {
    return { task: t.id, title: t.title, status: 'blocked', reason: impl.blocked_reason || impl.summary }
  }
  const pr = impl.pr_number
  log(`Task ${t.id}: PR #${pr} opened`)

  // -------- review: two independent readers of the diff, then fixes, at most twice
  const lenses =
    t.kind === 'docs'
      ? ['scope']
      : ['scope', 'security and test integrity']

  let reviews = []
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    reviews = (
      await parallel(
        lenses.map((lens) => () =>
          agent(
            `Review PR #${pr} (branch ${t.branch}) through one lens only: ${lens}.
Read the diff with \`gh pr diff ${pr}\` and ${taskText(t)} Do not modify anything.

${lens === 'scope'
  ? 'Scope: does the diff do what the task says — every step — and nothing the task does not ask for? Is anything from V1 creeping in (session pages, exercises, my results, my progress, master screens)?'
  : `Security and test integrity:
- RLS and own-results-only: could any change let a student read or write another student's data, or a student reach a teacher path?
- Secrets: any service_role or secret key, any .env file, any value printed in logs or messages?
- Migrations: are the two pushed migrations untouched? Does every SQL change come with a pgTAP test?
- Tests: was any test skipped, deleted, loosened, or changed to match a bug? Does each new test fail without the change it covers?
- Real data: any real name or email?`}
${GUARDRAILS}

Approve only if nothing blocks. A blocking issue must name the file, the problem and the fix.`,
            { label: `review:${t.id}:${lens.split(' ')[0]}:r${round}`, phase: 'Review', schema: REVIEW },
          ),
        ),
      )
    ).filter(Boolean)

    const blocking = reviews.flatMap((r) => r.blocking || [])
    if (reviews.length === lenses.length && blocking.length === 0) break
    if (round === MAX_ROUNDS) {
      return { task: t.id, title: t.title, status: 'needs-human', pr, reason: 'reviewers still blocking (or not answering) after two rounds', blocking }
    }
    // A reviewer that did not answer is not an approval: ask again, without a fix round.
    if (blocking.length === 0) continue

    const fix = await agent(
      `Fix the blocking review findings on PR #${pr}.
\`git fetch origin\`, \`git switch -C ${t.branch} origin/${t.branch}\`, \`npm ci\`.
Findings:
${JSON.stringify(blocking, null, 2)}
Address each one, re-run ${layersFor(t).join(' · ')}, commit, push to ${t.branch}. If a finding is wrong, do not change the code for it — say why in your summary.
${GUARDRAILS}`,
      { label: `fix:${t.id}:review:r${round}`, phase: 'Review', isolation: 'worktree', schema: FIX },
    )
    if (!fix || !fix.pushed) {
      return { task: t.id, title: t.title, status: 'needs-human', pr, reason: (fix && fix.gave_up_reason) || 'review fix did not push' }
    }
  }

  // -------- verify: a fresh agent runs every layer on the branch
  let verified = null
  if (t.kind !== 'docs') {
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const run = () =>
        agent(
          `Verify PR #${pr} independently. Do not modify any tracked file.
\`git fetch origin\`, \`git switch --detach origin/${t.branch}\`.
Run, in order, and report each layer with its outcome (counts of passed/failed tests, the first failure verbatim):
${layersFor(t).map((l) => `- ${l}`).join('\n')}
Also confirm: no test in the diff uses .skip/.only/fixme (\`git diff origin/dev...origin/${t.branch} | grep -nE "\\.(skip|only)\\(|test\\.fixme"\`).
green = every layer passed.`,
          { label: `verify:${t.id}:r${round}`, phase: 'Verify', isolation: 'worktree', schema: VERIFY },
        )
      verified = t.db ? await withDb(run) : await run()
      if (verified && verified.green) break
      if (round === MAX_ROUNDS) {
        return { task: t.id, title: t.title, status: 'needs-human', pr, reason: 'verification still red after two fix rounds', layers: verified && verified.layers }
      }
      const failures = ((verified && verified.layers) || []).filter((l) => !l.ok)
      const fix = await agent(
        `Verification failed on PR #${pr}. Fix the code (not the tests, unless a test is itself wrong — then say why).
\`git fetch origin\`, \`git switch -C ${t.branch} origin/${t.branch}\`, \`npm ci\`.
Failures:
${JSON.stringify(failures, null, 2)}
Use superpowers:systematic-debugging. Re-run the failing layers, commit, push to ${t.branch}.
${GUARDRAILS}`,
        { label: `fix:${t.id}:verify:r${round}`, phase: 'Verify', isolation: 'worktree', schema: FIX },
      )
      if (!fix || !fix.pushed) {
        return { task: t.id, title: t.title, status: 'needs-human', pr, reason: (fix && fix.gave_up_reason) || 'verify fix did not push' }
      }
    }
  }

  // -------- merge into dev, one PR at a time, only on green CI
  const merge = await withMerge(() =>
    agent(
      `Merge PR #${pr} into dev — only if it is safe.
1. \`gh pr view ${pr} --json baseRefName,mergeable,state\`: the base must be "dev". If it is anything else, stop: merged=false.
2. If it is not mergeable (conflict with dev): \`git fetch origin\`, \`git switch -C ${t.branch} origin/${t.branch}\`, \`git merge origin/dev\`, resolve keeping both sides' intent, run ${layersFor(t).join(' · ')}, push. (Merging dev into the feature branch is fine. Never merge main anywhere.)
3. \`gh pr checks ${pr} --watch --fail-fast\`. Every check must pass. If GitHub cannot run the checks (runners unavailable), stop: merged=false, and say so.
4. \`gh pr merge ${pr} --merge\` (no --delete-branch, no --admin).
${GUARDRAILS}`,
      { label: `merge:${t.id}`, phase: 'Merge', schema: MERGE },
    ),
  )

  return {
    task: t.id,
    title: t.title,
    status: merge && merge.merged ? 'merged' : 'needs-human',
    pr,
    pr_url: impl.pr_url,
    summary: impl.summary,
    reason: merge ? merge.reason : 'merge agent did not return',
    review_notes: reviews.flatMap((r) => r.notes || []),
    layers: verified && verified.layers,
  }
}

// ----------------------------------------------------------------- task 8
async function finalReview() {
  const lenses = [
    'security and RLS: own-results-only, the door (no self-enrollment, claiming a seat), secrets, anon access, migrations',
    'correctness: the student journey on a phone, autosave and hand-in, the builder, raw results and CSV, error paths',
    'test integrity: any test skipped, loosened, deleted or rewritten to match behaviour; layers that do not run in CI',
  ]
  const found = (
    await parallel(
      lenses.map((lens, i) => () =>
        agent(
          `Review everything about to be released: \`git fetch origin && git diff origin/main...origin/dev\`, through one lens: ${lens}.
Read ${SPEC} §1 and §5 for what V0 must be. Report only what you can point to in the diff, with evidence. Do not modify anything.`,
          { label: `final:find:${i + 1}`, phase: 'Final review', schema: FINDINGS },
        ),
      ),
    )
  )
    .filter(Boolean)
    .flatMap((r) => r.findings)

  const confirmed = (
    await parallel(
      found.map((f, i) => () =>
        agent(
          `Try to refute this finding about origin/dev. Read the code yourself; default to refuted=true if you cannot reproduce it from the code.
${JSON.stringify(f, null, 2)}`,
          { label: `final:skeptic:${i + 1}`, phase: 'Final review', schema: VERDICT },
        ).then((v) => (v && !v.refuted ? f : null)),
      ),
    )
  ).filter(Boolean)
  log(`Final review: ${found.length} findings, ${confirmed.length} survived the skeptics`)

  const readiness = await agent(
    `Write the release-readiness report for Pulse V0 (origin/dev → main).
Read ${SPEC} (§1 what V0 is, §3 the tasks, §6 open decisions), the Definition of done in CLAUDE.md, and ${PLAN} Task 9.
Confirmed findings from the review:
${JSON.stringify(confirmed, null, 2)}
Check the latest CI run on dev with \`gh run list --workflow ci.yml --branch dev --limit 1\`.
Give: what is done; what is not; every action only a person can take (Adrian, Parv), in order; the release PR body (dev → main, ready to paste, ending with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"); and the Scrum Board updates to make (card title, new status, one-line note).
Do not open the release PR. Do not modify anything.`,
    { label: 'final:readiness', phase: 'Final review', schema: READINESS },
  )
  return { task: 8, title: TASKS[8].title, status: 'reported', confirmed, readiness }
}

// ----------------------------------------------------------------- run one wave
if (!WAVES[waveKey]) {
  return { error: `args.wave must be one of ${ORDER.join(", ")} (got ${JSON.stringify(args && args.wave)}).` }
}

phase('Preflight')
const needsDb = WAVES[waveKey].flat().some((id) => TASKS[id].db)
const preflight = await agent(
  `Preflight for wave ${waveKey} of ${PLAN}. Check, report, change nothing.
${SHELL_SETUP}
- \`gh auth status\` — logged in.
- \`git fetch origin\` — origin/dev exists; the working tree of this checkout is clean.
${needsDb ? '- Docker is running and `npx supabase status` lists an API URL (this wave needs the local stack).' : ''}
- .env.local exists and \`grep -c "VITE_SUPABASE_URL=." .env.local\` and \`grep -c "VITE_SUPABASE_ANON_KEY=." .env.local\` are 1; \`grep -ci "service_role" .env.local\` is 0. Never print the file.
${wave === 1 ? `- decisionLogApproved is ${approved}. If false, that is a blocker: Adrian approves Appendix A of the plan first.` : ''}
${PREVIOUS[waveKey].length ? `- Previous tasks merged into dev: for each branch of ${JSON.stringify(PREVIOUS[waveKey].map((id) => TASKS[id].branch))}, \`gh pr list --base dev --state merged --head <branch>\` returns one PR.
- The latest CI run on dev (\`gh run list --workflow ci.yml --branch dev --limit 1\`) concluded success.` : ''}
- No open PR already exists for the branches of this wave: ${JSON.stringify(WAVES[waveKey].flat().filter((id) => TASKS[id].branch).map((id) => TASKS[id].branch))}.
ready = no blockers.`,
  { label: `preflight:wave${waveKey}`, phase: 'Preflight', schema: PREFLIGHT },
)

if (!preflight || !preflight.ready) {
  return {
    wave: waveKey,
    status: 'not-started',
    blockers: preflight ? preflight.blockers : ['preflight agent did not return'],
    notes: preflight ? preflight.notes : [],
  }
}
log(`Wave ${waveKey}: preflight passed`)

const results = []
for (const step of WAVES[waveKey]) {
  const stepResults = await parallel(
    step.map((id) => () => (TASKS[id].kind === 'review' ? finalReview() : runTask(TASKS[id]))),
  )
  results.push(...stepResults.filter(Boolean))
  const stopped = stepResults.filter((r) => !r || !['merged', 'nothing-to-do', 'reported'].includes(r.status))
  if (stopped.length) {
    log(`Wave ${waveKey}: stopping before the next step — ${stopped.length} task(s) need a person`)
    break
  }
}

phase('Report')
const clean = results.every((r) => ['merged', 'nothing-to-do', 'reported'].includes(r.status))
return {
  wave: waveKey,
  status: clean ? 'complete' : 'needs-human',
  next: clean && ORDER.indexOf(waveKey) < ORDER.length - 1 ? `Read this report, then launch wave ${ORDER[ORDER.indexOf(waveKey) + 1]}.` : clean ? 'Release: Task 9 of the plan (Adrian and Parv).' : 'Resolve the tasks marked needs-human or blocked, then relaunch this wave.',
  results,
}

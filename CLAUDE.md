# CLAUDE.md — Pulse

> Distilled from the Notion **Pulse — Second Brain** (last synced 19 Sep 2026). Notion wins if this file and Notion disagree.
> **Regenerate this file whenever the Notion Decision Log changes.**

## Read first (Notion)

1. 📖 Claude Operating Guide — rules of engagement
2. 🧠 Pulse — Second Brain → Non-negotiables
3. 🧾 Decision Log — newest entry wins
4. 📋 Pulse Scrum Board — Status = In Progress / To Do
5. Build spec: 🗺️ Page Framework v10 · 🏗️ Website Documentation · 🗄️ Data Architecture · 🔨 Build Plan

## The product

Pulse (working name) — a teacher-owned pre/post-class diagnostic for higher education. Creator: **Parv Kaur**. Stage: V0 proof of concept, piloted on the founders' own classes. No commercialization until the loop is proven.

## Stack

- React + Vite + TypeScript + Tailwind v4, hosted on **Vercel** (a preview deployment per branch).
- **Supabase, EU region** (Frankfurt or Paris) for data and auth. Client in `src/lib/supabase.ts`, keys in `.env.local` (see `.env.example`).
- **Zero serverless functions in V0**: the Supabase client plus Row Level Security (RLS) does everything.
- Icons: `lucide-react`. Routing: `react-router`.

## V0 scope (framework v10)

One role only: the **master account** (admin + teacher in one; the founders).

- **The door**: sign in; on first visit, create the account from a pre-created profile (email recognised, password chosen).
- **Student**: home · my modules · module page · entrance test (in the first class, 15–20 min) · my results (own only, general advice or preview) · sessions · session page · exercises · my progress.
- **Teacher (inside one module)**: create the entrance test · set up the sessions · prepare a session (drop content, add exercises) · raw results (a simple list of each student's answers).
- **Master**: create modules (with session count) · create classes with student profiles (name + email) · attach classes to modules.

**V0 non-goals**: no AI engine · no join-by-module-link · no welcome email · no check-before-publishing · no self-enrollment · no separate teacher accounts.

## Data model (V0)

`classes → student_profiles → (class ↔ module attachments) → modules → sessions → exercises → answers`

- The master account creates `student_profiles` (name + email) before any account exists.
- Sign-up is allowed **only when the email matches a profile** — enforced in the database (trigger/RLS), not the UI.
- `answers` holds both entrance-test and exercise answers; both feed the teacher's raw-results list.
- **RLS guarantees own-results-only** for students and class-scoped reading for the teacher.

## Non-negotiables

- Pulse and Tremplin are permanently separate — no shared code, data model or roadmap.
- The two data hierarchies never merge: no School/Batch/Group identifiers in the content hierarchy.
- The teacher reviews and approves every AI-drafted artifact (EU AI Act human oversight).
- No emotion or attention inference, ever (EU AI Act Art. 5(1)(f)).
- Participation = manual teacher grade + measurable practice engagement, shown as two separate signals, never blended.
- Never edit a taxonomy or test that is live for a class — version it.
- Parv's and Adrian's institution lists stay separate.
- Content naming: `Subject_Level_Session_Topic_ExN` (e.g. `ExcelAdvanced_Bachelors_S3_PivotTables_Ex2`).

## Design

- Locked palette (Tailwind tokens in `src/index.css`): `ink` #1B2A4A · `gold` #C9A227 · `sage` #2F7D6B · `paper` #F7F5F0.
- Type pair: to confirm from `website-DESIGN.md` (not yet in this repo).
- The app's look stays distinct from the marketing site. Student journey is **mobile-first**.
- Implement **from approved mockups in `/design`**, not from prose. Approved journeys: _none yet_.

## Build order (Build Plan, Step 2)

Data layer → the door → student test journey → teacher module space → raw results → master screens last (seed provisioning data by hand until then).

## Definition of done

Works on the seeded demo class · follows the design system · respects own-results-only · Scrum Board status updated · decisions logged in the Decision Log.

## Git workflow

- `main` is protected and always deployable (Vercel production).
- Short-lived branches (`feat/…`, `fix/…`, `docs/…`) → pull request → merge. Each branch gets a Vercel preview.
- Never commit `.env.local` or the Supabase `service_role` key.

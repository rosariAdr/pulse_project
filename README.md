# Pulse

A teacher-owned pre/post-class diagnostic for higher education. Proof of concept, V0.

The project's source of truth is the Notion **Pulse — Second Brain**. `CLAUDE.md` is its distilled mirror for Claude Code.

## Stack

React + Vite + TypeScript + Tailwind, hosted on Vercel. Supabase (EU region) for data and auth.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase URL and anon key
npm run dev
```

## Working together

- `main` is always deployable; Vercel deploys it to production.
- Every change goes on a short branch (`feat/…`, `fix/…`, `docs/…`) and reaches `main` through a pull request. Vercel builds a preview for each branch.
- After a work session, update the task's status on the Notion Scrum Board.

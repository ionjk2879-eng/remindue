# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo. See `README.md` for
the product/feature overview — this file is about *how* to work here.

## Git workflow

- **New features go on a branch, not `main`.** Create a feature branch
  (`git checkout -b <descriptive-name>`), commit there, and `git push -u origin
  <branch-name>`. Stop after pushing — **do not merge into `main`** (no
  `git merge`, no fast-forward, no merging a PR) unless the user explicitly asks.
  The user checks the branch's Cloudflare Workers Builds preview URL themselves
  before requesting the merge.
- Small fixes to something already broken/live in production (e.g. a
  misconfigured CORS origin) can go straight to `main` — that's a hotfix, not a
  new feature. If it's ambiguous which category a change falls into, ask.
- Only commit when the user explicitly asks you to.

## Project structure

```
workers/     Cloudflare Workers backend (Hono + D1) — the real backend, deployed
  src/routes/     API route handlers (auth, purchases, push, pending-purchases)
  src/lib/        business logic (purchase-logic, digest, email, push, email-intake/extract)
  migrations/     D1 schema migrations, applied in numeric order
frontend/    React + TypeScript + Vite — deployed as a separate Workers project
backend/     Spring Boot — logic reference only, not deployed (Phase 0 origin)
```

## Backend (workers/)

- D1 database, Hono router. `wrangler.jsonc` holds non-secret `vars`; secrets
  (`JWT_SECRET`, `RESEND_API_KEY`, `VAPID_*`, `ANTHROPIC_API_KEY`) live in
  `.dev.vars` locally (gitignored) and via `wrangler secret put <NAME>` in prod.
- New migration: add `migrations/000N_description.sql`, then
  `npm run db:migrate:local` before testing.
- `CORS_ORIGIN` is a comma-separated allowlist (see `allowedOrigins()` in
  `src/index.ts`) — add new frontend origins there rather than replacing the
  existing ones.
- `npm run typecheck` before considering backend work done.

## Frontend (frontend/)

- `npx tsc -b` before considering frontend work done.
- API base URL comes from `VITE_API_BASE_URL` at build time (see
  `src/api/client.ts`); defaults to `http://localhost:8787/api` for local dev.

## Verifying changes

- Prefer actually running the app (`workers`: `npm run dev` on :8787,
  `frontend`: `npm run dev` on :5173) and driving it with Playwright over
  trusting typecheck alone — this repo has caught real bugs (sort order, CORS)
  that only showed up when actually exercised.
- Local D1 lives at `workers/.wrangler/state/v3/d1` — inspect/seed it with
  `wrangler d1 execute remindue-db --local --command "..."` (or `--file=`).

# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo. See `README.md` for
the product/feature overview — this file is about *how* to work here.

## Git workflow

- **New features go on the `dev` branch — reuse it, don't create a new branch
  per feature.** `git checkout dev` (create it from `main` if it doesn't exist
  yet), commit there, `git push origin dev`. Stop after pushing — **do not
  merge into `main`** (no `git merge`, no fast-forward, no merging a PR) unless
  the user explicitly asks. The user checks `dev`'s preview URLs (see below)
  themselves before requesting the merge.
- Small fixes to something already broken/live in production (e.g. a
  misconfigured CORS origin) can go straight to `main` — that's a hotfix, not a
  new feature. If it's ambiguous which category a change falls into, ask.
- Only commit when the user explicitly asks you to.

## `dev` preview environment

Both Workers projects are on Cloudflare's free `workers.dev` subdomain
`ionjk2879`, which supports **aliased preview URLs**: `wrangler versions
upload --preview-alias <alias>` deploys a version without touching the live
production deployment, reachable at a **fixed** `https://<alias>-<worker-name>.
ionjk2879.workers.dev`. Using alias `dev` gives:

- Backend: `https://dev-remindue.ionjk2879.workers.dev`
- Frontend: `https://dev-remindue-frontend.ionjk2879.workers.dev`

These addresses don't change between pushes — re-running the upload just
replaces what they point to. This is deliberate instead of relying on Workers
Builds' automatic non-production-branch preview deploys, because those (a)
require "non-production branch builds" to be toggled on in the dashboard
(something only the human user can do) and (b) default to a random
per-version-hash URL, not a fixed one, unless the branch's deploy command is
customized to pass `--preview-alias dev` too.

**To (re)publish the `dev` preview after changing code:**

```bash
cd workers && npm run deploy:dev     # wrangler versions upload --preview-alias dev
cd frontend && npm run deploy:dev    # builds with .env.dev, then the same upload
```

`frontend/.env.dev` points `VITE_API_BASE_URL` at the dev backend alias above;
`frontend/.env.production` points at the real production backend. Both are
committed (they're not secret, just a base URL) — Vite picks the right one via
`--mode dev` / the default production mode. `workers/wrangler.jsonc`'s
`CORS_ORIGIN` permanently allows the dev frontend alias alongside prod — don't
remove it when editing the allowlist.

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
- **`wrangler deploy` / `wrangler versions upload` do NOT run migrations.**
  `npm run db:migrate:local` only touches the local D1 — remote (prod) needs
  its own explicit `npm run db:migrate:remote` (or
  `wrangler d1 migrations apply remindue-db --remote`). This bit us once
  already: 0005/0006 were merged, deployed, and worked fine locally, but
  nobody ran the `--remote` migration, so signup 500'd in production for a
  while with no obvious cause (code was fine, schema wasn't there). Whenever a
  migration lands on `main`/gets deployed live, apply it remotely in the same
  breath — check `wrangler d1 migrations list remindue-db --remote` if signup
  or any DB write starts 500ing for no visible reason.
- `CORS_ORIGIN` is a comma-separated allowlist (see `allowedOrigins()` in
  `src/index.ts`) — add new frontend origins there rather than replacing the
  existing ones.
- `npm run typecheck` before considering backend work done.

## Premium plan (`users.is_premium`)

Signup creates new users with `is_premium = 0` (free plan) — see `routes/auth.ts`.
Free-plan users are capped at `FREE_PLAN_MAX_PURCHASES` (5, in
`lib/purchase-logic.ts`) registered items; premium users are unlimited.
There's no billing/upgrade flow yet, so the only way to flip a specific
account to premium is directly in D1:

```bash
cd workers
npx wrangler d1 execute remindue-db --remote --command "UPDATE users SET is_premium = 1 WHERE email = 'someone@example.com';"
```

Drop `--remote` to do the same against the local dev database instead.
Existing accounts created before this flag existed already have
`is_premium = 1` (the column's original default) and were left alone —
only new signups get the free default.

## Frontend (frontend/)

- `npx tsc -b` before considering frontend work done.
- API base URL comes from `VITE_API_BASE_URL` at build time (see
  `src/api/client.ts` and `.env.production` / `.env.dev`); defaults to
  `http://localhost:8787/api` for local `vite` dev.

## Verifying changes

- Prefer actually running the app (`workers`: `npm run dev` on :8787,
  `frontend`: `npm run dev` on :5173) and driving it with Playwright over
  trusting typecheck alone — this repo has caught real bugs (sort order, CORS)
  that only showed up when actually exercised.
- Local D1 lives at `workers/.wrangler/state/v3/d1` — inspect/seed it with
  `wrangler d1 execute remindue-db --local --command "..."` (or `--file=`).

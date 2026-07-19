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
`lib/purchase-logic.ts`) registered items; premium users are unlimited and also
get the weekly recurring-delivery digest/summary and the in-app "놓친 배송
감지" (missed-delivery) hint (both gated on `isPremium` at the call sites, not
inside `purchase-logic.ts` itself).

Premium is now billing-managed (see `## Billing` below) via `users.premium_expires_at`.
`is_premium` is still the fast read-path every route checks, but the source of
truth is `premium_expires_at` — a daily cron keeps `is_premium` in sync with it.
Accounts with `premium_expires_at IS NULL` (pre-billing accounts, or anyone
flipped on manually) are never touched by billing logic — that's still a valid
manual-override escape hatch for support/testing:

```bash
cd workers
npx wrangler d1 execute remindue-db --remote --command "UPDATE users SET is_premium = 1 WHERE email = 'someone@example.com';"
```

Drop `--remote` to do the same against the local dev database instead. Leaving
`premium_expires_at` NULL when doing this keeps the account outside billing's
reach permanently (the expiry sweep only demotes rows where it's set and past).

## Billing (Toss Payments)

Three plans, all defined in one place — `workers/src/lib/billing-plans.ts`
(`PLAN_CONFIG`) — so the checkout route and the renewal cron can't drift apart
on price: **1회성**(2,200원/30일, no auto-renew), **월 정기결제**(1,900원/월),
**연 정기결제**(19,000원/년). Amounts are always server-decided; the client
never gets to say what it's paying — `routes/billing.ts`'s `/confirm` only
uses the client-echoed `amount` to *check against* what was stored server-side
at checkout time.

- **One-time flow**: `POST /billing/checkout` stores an order (server-picked
  amount + a fresh `orderId`) → frontend opens Toss's payment widget → Toss
  redirects to `/billing/success?paymentKey&orderId&amount` → frontend calls
  `POST /billing/confirm`, which verifies the amount against the stored order,
  calls Toss's confirm API, and extends `premium_expires_at`.
- **Recurring flow** (월/연): frontend opens Toss's billing-auth widget (card
  registration) → Toss redirects to `/billing/auth-success?authKey&customerKey`
  → frontend calls `POST /billing/billing-key/issue`, which exchanges
  `authKey` for a `billingKey`, charges the first cycle immediately, and
  stores the `billingKey` on a `subscriptions` row with `auto_renew=1`.
- **Auto-renewal**: Toss does **not** auto-charge billing keys on its own —
  `lib/billing-renewal.ts`'s `runBillingRenewals()` runs inside the existing
  daily cron (`scheduled()` in `index.ts`, same trigger as the digest jobs)
  and charges any `ACTIVE`/`auto_renew=1` subscription whose
  `current_period_end` is within a day of now. 3 consecutive failures
  auto-downgrades (`auto_renew=0`, status `PAST_DUE`) and emails the user;
  fewer than 3 just retries the next day (same cron tick). Right after,
  `runPremiumExpirySweep()` demotes `is_premium` for anyone whose
  `premium_expires_at` has passed and who isn't mid-retry.
- **Idempotency**: `payments.order_id` is unique and generated server-side
  before ever talking to Toss; `/confirm` and `/billing-key/issue` both check
  for an already-`CONFIRMED` row before re-calling Toss, so a duplicate
  redirect/click can't double-charge or double-extend premium.
- **No webhook yet** (scoped out of MVP) — the redirect-confirm round trip
  closes the loop for the normal case; the only gap is a user closing the tab
  between paying and the redirect landing, which would leave Toss showing a
  successful charge with nothing recorded on our side. Reconciling via Toss's
  webhook is a known fast-follow, not yet built.
- **Dev testing**: `POST /api/dev/run-billing-renewal` (dev-only route, same
  `ENVIRONMENT === 'development'` gate as the other `routes/dev.ts` tools)
  runs `runBillingRenewals` + `runPremiumExpirySweep` immediately instead of
  waiting for the daily cron — useful after manually backdating a test
  subscription's `current_period_end` in D1.
- **Secrets**: `TOSS_SECRET_KEY` (backend, Basic-auth secret — `.dev.vars`
  locally, `wrangler secret put TOSS_SECRET_KEY` in prod; test keys look like
  `test_sk_...`, live keys `live_sk_...`). `VITE_TOSS_CLIENT_KEY` is **not**
  secret (it's meant to ship in frontend JS) — it lives in
  `frontend/.env.dev` / `.env.production`, not in the Workers `Env` at all.
  Both key types come from developers.tosspayments.com (free signup, no
  business registration needed for test keys — a trial store is auto-created).
- **Migration**: `migrations/0011_add_billing_tables.sql` added `subscriptions`
  and `payments` tables plus `users.premium_expires_at` /
  `users.toss_customer_key`. Like every migration, `db:migrate:local` doesn't
  touch prod — run `db:migrate:remote` (or `wrangler d1 migrations apply
  remindue-db --remote`) before/at the same time this ships to production, or
  billing routes will 500 in prod with no obvious cause (see the migration
  warning under `## Backend` above — this bit the project once already).

### Dev-only testing tools (`routes/dev.ts`)

`ENVIRONMENT` (a `vars` entry, not a secret) is `"production"` for every
deployed version by default; `.dev.vars` sets it to `"development"` for
local `wrangler dev`, and `deploy:dev` passes `--var
ENVIRONMENT:development` so only the `dev`-alias preview gets it too. Two
routes are gated on `ENVIRONMENT === 'development'` (404 otherwise, so they
don't exist at all in production):

- `POST /api/dev/seed-test-data` — seeds the logged-in account with two
  RECURRING_DELIVERY purchases (a 90-days-ago/30-day-interval one and a
  3-days-ago/7-day-interval one, both with 0 confirmations) so "missed
  delivery" and "this week's deliveries" are visible immediately instead
  of waiting on real historical data.
- `POST /api/dev/run-weekly-digest` — runs `runWeeklyDigest` immediately,
  bypassing the Monday-only gate. `scheduled()` itself also skips that
  gate whenever `ENVIRONMENT === 'development'`, so
  `/cdn-cgi/handler/scheduled` (local `wrangler dev` only — deployed
  Workers have no HTTP-reachable way to fire cron manually) triggers the
  weekly digest on any day too. Use this endpoint for the same thing
  against a deployed `dev` preview, where `/cdn-cgi/handler/scheduled`
  doesn't exist.

If you edit `.dev.vars` while `wrangler dev` is already running, do a full
restart (kill + `npm run dev` again) rather than trusting the file-watcher
hot-reload — hot-reload picks up source changes but has been observed to
serve a stale `vars`/`.dev.vars` snapshot until the process restarts.

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

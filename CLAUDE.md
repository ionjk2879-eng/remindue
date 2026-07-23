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
Seven things are gated on `isPremium`, all checked at the call site (not inside
`purchase-logic.ts`):
1. **Unlimited registration** — free is capped at `FREE_PLAN_MAX_PURCHASES` (5,
   in `lib/purchase-logic.ts`); `routes/purchases.ts`'s `POST /` 402s past that.
2. **Weekly recurring-delivery summary** — email/push + in-app banner, gated in
   `lib/weekly-digest.ts` and `DashboardPage.tsx`.
3. **Custom notification days** — see `## Notification preferences` below.
4. **CSV/PDF export** — see `## Data export` below.
5. **Family/member sharing** — see `## Sharing` below.
6. **Archive (이력 보관)** — see `## Archive` below.
7. **AI auto-registration (email forwarding + photo upload)** — `lib/email-intake.ts`
   checks `user.is_premium` before calling Claude at all (free-plan forwarded mail is
   silently dropped, no extraction attempted); `routes/purchases.ts`'s
   `POST /analyze-image` 402s outright for free-plan users. Both funnel through the
   same extraction core (`lib/order-extraction.ts`) and land in `pending_purchases`
   via `lib/pending-purchase-intake.ts` — see `## AI auto-registration` below.

(A "놓친 배송 감지" / missed-delivery-detection feature used to be premium
benefit #2 — it compared computed delivery rounds against
`delivery_confirm_count` and flagged a mismatch as "possibly missed." It was
removed (not just hidden) because that comparison false-positived often enough
(late/early real deliveries, confirm-button not clicked promptly) to be
actively misleading. `delivery_confirm_count` itself is still tracked — the
"이번 회차 수령 확인" button still increments it — just nothing computes a
"missed count" from it anymore. If this comes back, don't resurrect
`computeMissedConfirmations` verbatim; it's gone from `purchase-logic.ts` for
a reason.)

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

## Notification preferences (`users.notification_days`)

Free plan is hard-locked to `7,3,1,0` regardless of what's stored in the
column — `lib/notification-prefs.ts`'s `effectiveNotificationDays(isPremium,
raw)` is the only place that's allowed to decide what days actually apply, and
both `lib/digest.ts` (daily D-day mail/push) and `routes/settings.ts`
(`GET`/`PUT /api/settings/notification-days`) go through it. Premium users can
pick any 1–10 integers in `[0, 60]` from `NOTIFICATION_DAY_OPTIONS` (`[10, 7,
5, 3, 2, 1, 0]` — mirrored as a plain array literal in
`frontend/src/pages/SettingsPage.tsx` since there's no shared package between
frontend/backend). Downgrading to free doesn't clear the stored value — it's
just ignored until premium comes back, so a lapsed subscriber's custom
schedule reappears automatically on renewal instead of needing to be re-entered.

## Data export (CSV/PDF)

`GET /api/purchases/export?format=csv|pdf` (premium-gated, 402 for free) in
`routes/purchases.ts`, built by `lib/export.ts`. Exports **all** items
(active + archived) — export is meant to be a full-history dump, unlike the
dashboard's default active-only view.

- **CSV**: UTF-8 BOM prefix + CRLF line endings so Excel doesn't mangle Hangul
  or word-wrap wrong.
- **PDF**: `pdf-lib` + `@pdf-lib/fontkit`, embedding Noto Sans KR fetched at
  request time from `fonts.gstatic.com` (cached via the Workers Cache API —
  `caches.default` — so it's only actually downloaded once per edge location,
  not per request) rather than bundled into the Worker, which would blow past
  Cloudflare's free-plan script-size limit. Two hard-won gotchas if you touch
  `lib/export.ts`:
  - **`embedFont(..., { subset: true })` is broken for this font/runtime
    combination** — verified by hand that it silently drops entire glyphs
    (not just renders them wrong). Stay on `subset: false` (full font embed,
    ~3MB per generated PDF) until/unless this gets re-verified against a newer
    `pdf-lib`/`@pdf-lib/fontkit` release.
  - **A literal space (U+0020) between two Hangul characters renders as a
    missing glyph** in this font via `page.drawText` — e.g. "삼성 냉장고"
    would lose the space and look broken, which matters because that's a
    completely ordinary Korean item name. Latin↔Hangul-adjacent spaces are
    fine; only Hangul-space-Hangul breaks. Worked around with `drawTextSafe()`
    in that file, which never asks the font to shape a real space glyph —  it
    splits on spaces and manually advances the cursor between words instead.
    Any new text drawn in this file must go through `drawTextSafe`, not raw
    `page.drawText`, or this bug comes back.

## Sharing (`shared_access` table)

Premium-gated invite (`POST /api/sharing/invite`, owner must be premium) by
raw email — no invite token/link. `shared_with_email` just has to match
whatever email the invitee eventually logs in with; if they don't have an
account yet, the invite sits `pending` until they sign up with that exact
address. `GET /api/sharing/received` doesn't require the viewer to be
premium — anyone can be invited and view what's shared with them, only
*inviting* is gated. Accepted shares are read-only (`GET
/api/sharing/:id/purchases` — active/non-archived items only, no
mutation endpoints exposed to the invitee). `routes/sharing.ts` has the full
invite/accept/revoke/view lifecycle.

## Archive (`purchases.archived_at`)

Premium-gated action (`POST /api/purchases/:id/archive`, 402 for free),
but **unarchive is not gated** (`POST /api/purchases/:id/unarchive`) — a
downgraded user can still pull old items back into their active list, they
just can't send new ones to the archive. `GET /api/purchases` defaults to
`archived_at IS NULL`; pass `?archived=true` for the archive view instead.
Archived items are excluded from both digest crons (`lib/digest.ts`,
`lib/weekly-digest.ts` both filter `archived_at IS NULL`) — archiving means
"stop bothering me about this," not just "hide it from the main list."

## AI auto-registration (email forwarding + photo upload)

Two intake channels feed the same `pending_purchases` review queue, sharing
one extraction core so their classification behavior can never drift apart:

- **`lib/order-extraction.ts`** — the shared schema (`ExtractedOrder`),
  system prompt, and `callExtractionApi()` that calls the Claude Messages API
  with `output_config.format: json_schema` (structured outputs). Both
  channels pass the exact same schema/prompt; only the `content` blocks
  differ (text-only for email, `image` + instruction text for photos).
  **`integer` fields must not carry `minimum`/`maximum`** — Anthropic's
  structured-output schema validation rejects that (400
  `output_config.format.schema: ... properties maximum, minimum are not
  supported`), which is exactly what silently broke email auto-registration
  for a while (every call 400'd, every email got treated as "not an order
  confirmation"). Range checks like `fixedDayOfMonth` (1–31) are validated
  after the fact by `pending-purchase-intake.ts`'s sanitize functions instead.
- **`lib/email-extract.ts`** — wraps the email subject+body as a text content
  block, called from `lib/email-intake.ts` (the Cloudflare Email Routing
  handler). Premium-gated *before* calling Claude at all — free-plan mail is
  dropped with no extraction attempt.
- **`lib/image-extract.ts`** — wraps an uploaded photo as a base64 `image`
  content block, called from `routes/purchases.ts`'s
  `POST /api/purchases/analyze-image`. Premium-gated with a 402. Accepts
  JPEG/PNG/WEBP/GIF up to 8MB (`isAllowedImageMediaType` /
  `isImageTooLarge`). Unlike email (silently dropped on no match), this is an
  interactive request — a non-order-confirmation image 400s with a
  user-facing message instead of silently doing nothing.
- **`lib/pending-purchase-intake.ts`** — turns a raw `ExtractedOrder` into a
  `pending_purchases` row: `sanitizeEstimatedType`/`sanitizeReturnDeadlineDays`/
  `sanitizeFixedDayOfMonth` never trust the model's output at face value, and
  `buildPendingPurchaseFields()` resolves the FIXED_DAY→INTERVAL fallback (an
  invalid/missing `fixedDayOfMonth` demotes the item back to INTERVAL) before
  computing `scheduleEstimated`. `insertPendingPurchase(db, userId, source,
  extracted)` is the single INSERT both channels call — `source` is `'email'`
  or `'image'` (`pending_purchases.source`).
- **`schedule_estimated`** (`migrations/0018`) — true when the source didn't
  state an exact interval/fixed-day and the AI (or the intake fallback) filled
  `intervalDays = DEFAULT_INTERVAL_DAYS` (30) as a guess. Mirrors the older
  `return_deadline_estimated` pattern. Drives the "정확한 주기를 확인해주세요"
  warning in `DashboardPage.tsx`'s pending-item cards, and flips the
  "바로 등록" vs "확인 후 등록" button label.

If you touch the extraction schema, remember it's shared — a change meant
for one channel (e.g. tightening the image prompt) silently changes email
classification too, and vice versa.

## Account deletion (`DELETE /api/auth/account`)

Password-reconfirmed. Deletes everything that's purely personal data
(`purchases`, `push_subscriptions`, `pending_purchases`, `shared_access` where
the deleted user was the owner) — but **the `users` row itself is anonymized,
not deleted**: `email` → a random `deleted-{id}-{uuid}@remindue.invalid`,
`password_hash` → an unusable random hash (login becomes impossible),
`nickname` → `"탈퇴한 회원"`, `forwarding_token` → regenerated (so the old
`add-{token}@...` address stops accepting mail immediately), `is_premium` → 0,
`premium_expires_at`/`toss_customer_key` → NULL. Any `ACTIVE` subscription is
flipped to `CANCELED`/`auto_renew=0`/`toss_billing_key=NULL`, identical to
what `/api/billing/cancel` does.

**Why anonymize instead of delete:** 전자상거래법 시행령 제6조 requires
"계약 또는 청약철회 등에 관한 기록" (`subscriptions`) and "대금결제 및 재화
등의 공급에 관한 기록" (`payments`) to be retained for 5 years — a legal
minimum, not optional, and it overrides a deletion request for those two
tables specifically (개인정보보호법 recognizes this exact exception).
Anonymization is itself a legally valid form of "파기" (destruction) under
개인정보보호법 — a person is no longer identifiable, without needing to
actually drop the row. This was **not the first approach tried**: an earlier
version literally `DELETE FROM users` and left `subscriptions`/`payments` rows
untouched, relying on their `user_id` FK having no cascade — except D1 runs
with `PRAGMA foreign_keys=1`, so `ON DELETE CASCADE` on those FKs silently
wiped the "retained" records anyway (reproduced locally). A follow-up
migration to strip that `CASCADE` via table-recreation succeeded on local D1
but **failed remotely** with a live `FOREIGN KEY constraint failed` error
against the real `subscriptions`/`payments` data (`payments.subscription_id`
still referencing the table mid-recreation, and remote D1 did not honor
`PRAGMA foreign_keys=OFF` the way local miniflare-SQLite did) — caught before
it did any damage (`wrangler d1 execute` rolled back cleanly), but not a risk
worth re-attempting on tables holding real money records. Anonymizing `users`
sidesteps the cascade question entirely: the row (and thus the FK target)
never goes away, so nothing ever cascades. If you're tempted to "clean this up"
into a real `DELETE FROM users` again, re-read this paragraph first.

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

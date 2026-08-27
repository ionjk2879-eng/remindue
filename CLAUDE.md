# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repo. See `README.md` for
the product/feature overview — this file is about *how* to work here.

## 대화 스타일

- 사용자와 대화할 때는 항상 존댓말(해요체/합니다체)을 쓴다. 반말 금지.

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

**Production deployment** is handled automatically by Cloudflare Workers Builds
when `main` is pushed to GitHub — no manual `wrangler deploy` needed. The full
workflow is: work on `dev` → deploy:dev to check the preview → merge to `main`
and push → Cloudflare auto-deploys to production.

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

## Premium plan — removed (2026-08-27)

Remindue used to have a paid premium tier (billing-managed via
`users.is_premium`/`premium_expires_at`), gating unlimited registration,
weekly summary, custom notification days, CSV/PDF export, family sharing,
archive, and AI 소비 매니저. **All of that gating has been removed** — the
business registration behind it was closed, so the app can no longer legally
process payments, and it's now a free, single-operator app. Every feature
listed above is unconditionally available to everyone; there is no more
free/premium distinction anywhere in the code.

`users.is_premium` / `premium_expires_at` / `toss_customer_key` /
`confirmation_advance_days` columns still physically exist in D1 (left alone
deliberately — see `## Account deletion` below for why destructive schema
changes on billing-adjacent tables are risky) but nothing reads them for
gating anymore. Don't resurrect a premium check against them without asking
first — the whole point of this pass was to open everything up.

## Billing — removed (2026-08-27)

Remindue used to integrate Toss Payments and KakaoPay for a paid premium
subscription (`routes/billing.ts`, `routes/billing-kakao.ts`,
`lib/billing-plans.ts`, `lib/billing-renewal.ts`, `lib/kakaopay.ts`,
`lib/toss.ts`, and the `PricingPage`/`Billing*Page` frontend pages/routes) —
all of it has been deleted. The business registration behind the payment
processing was closed, so new checkouts can no longer legally happen, and the
app has no premium tier left to sell (see `## Premium plan` above).

The `subscriptions` and `payments` D1 tables (from
`migrations/0011_add_billing_tables.sql`) are **left in place, untouched** —
they hold historical payment records subject to a 5-year retention
requirement under 전자상거래법 (see `## Account deletion` below for the full
legal reasoning and a past incident with destructive migrations on these
exact tables). If you're tempted to drop them, don't — that's a data-retention
decision, not a code-cleanup one.

If billing is ever reintroduced (new business registration, etc.), rebuilding
it from scratch is more likely to be correct than trying to resurrect the
deleted files verbatim — check git history around this date for reference,
but re-verify current pricing/legal requirements rather than copying the old
flow blind.

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

Anyone can pick any 1–10 integers in `[0, 60]` from `NOTIFICATION_DAY_OPTIONS`
(`[10, 7, 5, 3, 2, 1, 0]`, in `shared/domain-policy.ts`) via `GET`/`PUT
/api/settings/notification-days` — `lib/notification-prefs.ts`'s
`effectiveNotificationDays(raw)` is the only place that's allowed to decide
what days actually apply (both `lib/digest.ts`'s daily D-day mail/push and the
settings route go through it), and it just parses the stored value with
`DEFAULT_NOTIFICATION_DAYS` (`[7, 3, 0]`) as the fallback for an unset/corrupt
value. There used to be a free/premium split here (free hard-locked to
`7,3,0`) — removed along with the rest of billing, see `## Premium plan`
above.

## Confirmation nudges (`purchases.discontinued_at`, "유지하기"/"유지 안 함")

Separate from the D-day digest above — this is about *usage confirmation*
for recurring subscriptions/deliveries, not deadline reminders.

- **`missedRoundsFor(deliveryRound, deliveryConfirmCount, dDay)`** — how many
  consecutive rounds have gone unconfirmed. Duplicated in both
  `frontend/src/pages/DashboardPage.tsx` and `workers/src/lib/
  confirmation-nudge.ts` (no shared package). **Do not reintroduce a "missed
  delivery" framing around this number** — an earlier feature
  (`computeMissedConfirmations`, compared round count vs confirm count the
  same way) was deliberately removed from `purchase-logic.ts` after
  false-positiving constantly on late/early real deliveries. This one only
  ever suggests "please check in," never asserts non-use, and silence is
  never treated as "사용 안 함" in any copy — only `discontinued_at` being set
  (an explicit "유지 안 함" click) is.
- **`purchases.discontinued_at`** (`migrations/0025`) — user-declared "I don't
  use this anymore." Set via `POST /purchases/:id/discontinue`; cleared back
  to `NULL` by `mark-delivered`/`confirm-all` (clicking "유지하기" always means
  "resuming/still using," regardless of prior state).
- **`POST /purchases/confirm-all`** (`{ ids: number[] }`) — bulk "유지하기" so
  users don't have to click every recurring item individually; batches via
  `db.batch()`.
- **`workers/src/lib/confirmation-nudge.ts`** (`runConfirmationNudge`, called
  from the same daily cron as `runDailyDigest` — **must** run daily, not
  weekly, or dDay-exact triggers on non-matching weekdays get silently
  skipped forever) — four stages per recurring item, all in KRW-agnostic
  dDay terms:
  1. **Advance** — anyone can customize how many days ahead this fires via
     `renewal_notification_days` (same `effectiveNotificationDays` helper as
     `## Notification preferences` above, just a separate column) — fires
     unconditionally every cycle, batched per user into one email/push
     alongside the other stages below.
  2. **Same-day** (dDay === 0) — fires unconditionally every cycle, but
     *individually* per item (not batched) because it carries a Web Push
     `actions` array (`유지하기`/`나중에`) that must map to exactly one
     purchase. Deliberately avoids "오늘 배송/결제됩니다" factual framing
     (couriers/card issuers already send that) — copy is "계속
     유지하시겠어요?" instead.
  3. **Follow-up** (dDay === -1) — only if still unconfirmed
     (`missedRoundsFor >= 1`).
  4. **Review-flagged** (dDay === -7) — only if *still* unconfirmed a week
     later; confirmed-tone "AI가 절약 검토 대상으로 표시했습니다" copy.
- **Push action buttons without a login session**: a service worker can't
  reach the page's JWT (see `sw.ts`'s `pushsubscriptionchange` comment for
  the same limitation elsewhere). `workers/src/lib/action-tokens.ts` issues a
  single-use, 24-hour `push_action_tokens` row (`migrations/0026`) per
  same-day notification; tapping "유지하기" hits `POST
  /api/push/confirm-action` (deliberately unauthenticated — same
  "possession of the token proves the right to act" pattern as `POST
  /api/push/unsubscribe`) with just that token.
- Platforms without Notification `actions` support (iOS Safari) silently
  ignore the field — tapping the notification body falls back to opening the
  dashboard, same as any other push.

## Data export (CSV/PDF)

`GET /api/purchases/export?format=csv|pdf` (open to everyone) in
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

Invite (`POST /api/sharing/invite`, open to everyone) by raw email — no
invite token/link. `shared_with_email` just has to match whatever email the
invitee eventually logs in with; if they don't have an account yet, the
invite sits `pending` until they sign up with that exact address. Accepted
shares are read-only (`GET /api/sharing/:id/purchases` — active/non-archived
items only, no mutation endpoints exposed to the invitee). `routes/sharing.ts`
has the full invite/accept/revoke/view lifecycle.

## Archive (`purchases.archived_at`)

Open to everyone (`POST /api/purchases/:id/archive` /
`POST /api/purchases/:id/unarchive`). `GET /api/purchases` defaults to
`archived_at IS NULL`; pass `?archived=true` for the archive view instead.
Archived items are excluded from both digest crons (`lib/digest.ts`,
`lib/weekly-digest.ts` both filter `archived_at IS NULL`) — archiving means
"stop bothering me about this," not just "hide it from the main list."

## Discard vs cancel (`purchases.discarded_at` vs `DELETE /purchases/:id`)

Two different ways to remove an item from the visible lists, free for everyone
(no premium gate on either):

- **Discard ("삭제")** — `POST /api/purchases/:id/discard` sets `discarded_at`.
  The row stays in D1. Meant for stuff that already genuinely happened (a
  delivery you received, a payment you made) that the user just wants off
  their list — the spend must still count. `GET /purchases` (both the default
  active view and `?archived=true`) filters `discarded_at IS NULL`, so a
  discarded row disappears from every browsable list and from all three
  crons (digest/confirmation-nudge/weekly-digest, all now also filter
  `discarded_at IS NULL`) — but nothing deletes the row, so it's still there
  for spend accounting and CSV/PDF export (`GET /purchases/export` has no
  `archived_at`/`discarded_at` filter at all, by design — it's meant to be
  the full historical record).
- **Cancel ("취소")** — the pre-existing `DELETE /api/purchases/:id`, a real
  hard delete. For the opposite case: registered by mistake, an order that
  got cancelled before anything was actually charged, or a refund that means
  the spend shouldn't count anymore. Since the row is gone, it also
  disappears from spend accounting.

Frontend-side, spend totals ("이번 달/올해 예상지출", the AI brief's spend
figures) are computed from a **separate** fetch —
`fetchPurchasesForSpendHistory()` → `GET /purchases?scope=spend`, which
ignores `archived_at`/`discarded_at` entirely and returns every row for the
user (still excludes hard-deleted/cancelled rows, since those don't exist in
D1 anymore). `DashboardPage.tsx` keeps this in a separate `spendHistoryPurchases`
state, distinct from the `purchases` state used for card rendering — never
merge these two or archived/discarded items will start showing up as cards.
For recurring items, `occurrenceDatesInMonth`'s `spendCutoffDate` caps
generated occurrences at `archivedAt`/`discardedAt` (whichever is earlier) so
only occurrences that actually happened while the item was live get counted
— an archived subscription's spend from before it was archived still counts,
but it stops accruing projected future-month spend.

## AI auto-registration (email forwarding)

- **`lib/order-extraction.ts`** — the schema (`ExtractedOrder`), system
  prompt, and `callExtractionApi()` that calls the Claude Messages API with
  `output_config.format: json_schema` (structured outputs).
  **`integer` fields must not carry `minimum`/`maximum`** — Anthropic's
  structured-output schema validation rejects that (400
  `output_config.format.schema: ... properties maximum, minimum are not
  supported`), which is exactly what silently broke email auto-registration
  for a while (every call 400'd, every email got treated as "not an order
  confirmation"). Range checks like `fixedDayOfMonth` (1–31) are validated
  after the fact by `pending-purchase-intake.ts`'s sanitize functions instead.
- **`lib/email-extract.ts`** — wraps the email subject+body as a text content
  block, called from `lib/email-intake.ts` (the Cloudflare Email Routing
  handler). Available to everyone, no gating.
- **`lib/pending-purchase-intake.ts`** — turns a raw `ExtractedOrder` into a
  `pending_purchases` row: `sanitizeEstimatedType`/`sanitizeReturnDeadlineDays`/
  `sanitizeFixedDayOfMonth` never trust the model's output at face value, and
  `buildPendingPurchaseFields()` resolves the FIXED_DAY→INTERVAL fallback (an
  invalid/missing `fixedDayOfMonth` demotes the item back to INTERVAL) before
  computing `scheduleEstimated`. `insertPendingPurchase(db, userId, source,
  extracted)` does the INSERT — `source` is always `'email'` today
  (`pending_purchases.source` also allows `'image'` for a possible future
  photo-upload channel, but nothing populates that yet — a first attempt at
  one hit an Anthropic-account-level 403 on any image-bearing request and was
  pulled back out; see git history around `order-extraction.ts` if revisiting).
- **`schedule_estimated`** (`migrations/0018`) — true when the email didn't
  state an exact interval/fixed-day and the AI (or the intake fallback) filled
  `intervalDays = DEFAULT_INTERVAL_DAYS` (30) as a guess. Mirrors the older
  `return_deadline_estimated` pattern. Drives the "정확한 주기를 확인해주세요"
  warning in `DashboardPage.tsx`'s pending-item cards, and flips the
  "바로 등록" vs "확인 후 등록" button label.

## Account deletion (`DELETE /api/auth/account`)

Password-reconfirmed. Deletes everything that's purely personal data
(`purchases`, `push_subscriptions`, `pending_purchases`, `shared_access` where
the deleted user was the owner) — but **the `users` row itself is anonymized,
not deleted**: `email` → a random `deleted-{id}-{uuid}@remindue.invalid`,
`password_hash` → an unusable random hash (login becomes impossible),
`nickname` → `"탈퇴한 회원"`, `forwarding_token` → regenerated (so the old
`add-{token}@...` address stops accepting mail immediately), `is_premium` → 0,
`premium_expires_at`/`toss_customer_key` → NULL. Any `ACTIVE` subscription row
is flipped to `CANCELED`/`auto_renew=0`/`toss_billing_key=NULL`. (Billing
itself was removed — see `## Billing` above — but this logic is untouched:
it's still correct for any pre-existing historical subscription rows, and
costs nothing to leave in place.)

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

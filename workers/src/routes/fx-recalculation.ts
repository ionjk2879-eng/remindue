import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors';
import { convertToKrw } from '../lib/pending-purchase-intake';
import { recordFxCalculationAudit } from '../lib/fx-audit';
import type { FxCardBrand, FxCardIssuer } from '../lib/fx-card';
import type { Env, PurchaseRow, UserRow } from '../types';

const fxRecalculation = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
fxRecalculation.use('*', authMiddleware);

interface JobRow {
  id: number;
  user_id: number;
  status: string;
  total_count: number;
  ready_count: number;
  failed_count: number;
  applied_count: number;
  created_at: string;
  completed_at: string | null;
}

interface ItemRow {
  id: number;
  job_id: number;
  purchase_id: number;
  item_name: string;
  calculation_date: string;
  original_amount: number;
  original_currency: string;
  before_amount: number | null;
  before_exchange_rate: number | null;
  proposed_amount: number | null;
  proposed_exchange_rate: number | null;
  rate_source: string | null;
  rate_date: string | null;
  card_issuer: string | null;
  card_brand: string | null;
  formula_version: string | null;
  used_fallback: number;
  status: string;
  error_message: string | null;
  retry_count: number;
  applied_at: string | null;
}

async function currentUser(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) throw new NotFoundError('사용자를 찾을 수 없습니다.');
  return user;
}

async function ownedJob(db: D1Database, jobId: number, userId: number): Promise<JobRow> {
  const job = await db.prepare('SELECT * FROM fx_recalculation_jobs WHERE id = ? AND user_id = ?')
    .bind(jobId, userId).first<JobRow>();
  if (!job) throw new NotFoundError('재계산 작업을 찾을 수 없습니다.');
  return job;
}

function itemResponse(row: ItemRow) {
  return {
    id: row.id,
    purchaseId: row.purchase_id,
    itemName: row.item_name,
    calculationDate: row.calculation_date,
    originalAmount: row.original_amount,
    originalCurrency: row.original_currency,
    beforeAmount: row.before_amount,
    beforeExchangeRate: row.before_exchange_rate,
    proposedAmount: row.proposed_amount,
    proposedExchangeRate: row.proposed_exchange_rate,
    rateSource: row.rate_source,
    rateDate: row.rate_date,
    cardIssuer: row.card_issuer,
    cardBrand: row.card_brand,
    formulaVersion: row.formula_version,
    usedFallback: row.used_fallback === 1,
    status: row.status,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    appliedAt: row.applied_at,
  };
}

async function jobResponse(db: D1Database, job: JobRow) {
  const { results } = await db.prepare('SELECT * FROM fx_recalculation_items WHERE job_id = ? ORDER BY id')
    .bind(job.id).all<ItemRow>();
  return {
    id: job.id,
    status: job.status,
    totalCount: job.total_count,
    readyCount: job.ready_count,
    failedCount: job.failed_count,
    appliedCount: job.applied_count,
    createdAt: job.created_at,
    completedAt: job.completed_at,
    items: results.map(itemResponse),
  };
}

async function refreshJobCounts(db: D1Database, jobId: number, status?: string) {
  await db.prepare(
    `UPDATE fx_recalculation_jobs SET
       total_count = (SELECT COUNT(*) FROM fx_recalculation_items WHERE job_id = ?),
       ready_count = (SELECT COUNT(*) FROM fx_recalculation_items WHERE job_id = ? AND status = 'READY'),
       failed_count = (SELECT COUNT(*) FROM fx_recalculation_items WHERE job_id = ? AND status = 'FAILED'),
       applied_count = (SELECT COUNT(*) FROM fx_recalculation_items WHERE job_id = ? AND status = 'APPLIED'),
       status = COALESCE(?, status),
       completed_at = CASE WHEN ? IN ('APPLIED', 'PARTIAL') THEN datetime('now') ELSE completed_at END
     WHERE id = ?`
  ).bind(jobId, jobId, jobId, jobId, status ?? null, status ?? null, jobId).run();
}

async function calculateItem(env: Env, user: UserRow, jobId: number, purchase: PurchaseRow, retryCount = 0) {
  const converted = await convertToKrw(
    purchase.original_currency!,
    purchase.original_amount!,
    purchase.base_date,
    user.fx_card_issuer as FxCardIssuer | null,
    user.fx_card_brand as FxCardBrand | null,
    env.KOREA_EXIM_API_KEY,
  );
  if (!converted) {
    await env.DB.prepare(
      `INSERT INTO fx_recalculation_items
        (job_id, purchase_id, item_name, calculation_date, original_amount, original_currency,
         before_amount, before_exchange_rate, status, error_message, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FAILED', ?, ?)
       ON CONFLICT(job_id, purchase_id) DO UPDATE SET
         status = 'FAILED', error_message = excluded.error_message, retry_count = excluded.retry_count`
    ).bind(
      jobId, purchase.id, purchase.item_name, purchase.base_date, purchase.original_amount,
      purchase.original_currency, purchase.amount, purchase.exchange_rate,
      '환율 데이터를 조회하지 못했습니다.', retryCount,
    ).run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO fx_recalculation_items
      (job_id, purchase_id, item_name, calculation_date, original_amount, original_currency,
       before_amount, before_exchange_rate, proposed_amount, proposed_exchange_rate,
       rate_source, rate_date, card_issuer, card_brand, formula_version, used_fallback,
       status, retry_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?)
     ON CONFLICT(job_id, purchase_id) DO UPDATE SET
       proposed_amount = excluded.proposed_amount, proposed_exchange_rate = excluded.proposed_exchange_rate,
       rate_source = excluded.rate_source, rate_date = excluded.rate_date,
       card_issuer = excluded.card_issuer, card_brand = excluded.card_brand,
       formula_version = excluded.formula_version, used_fallback = excluded.used_fallback,
       status = 'READY', error_message = NULL, retry_count = excluded.retry_count`
  ).bind(
    jobId, purchase.id, purchase.item_name, purchase.base_date, purchase.original_amount,
    purchase.original_currency, purchase.amount, purchase.exchange_rate,
    converted.amountKrw, converted.rate, converted.rateSource, converted.rateDate,
    converted.cardIssuer, converted.cardBrand, converted.formulaVersion,
    converted.usedFallback ? 1 : 0, retryCount,
  ).run();
}

fxRecalculation.post('/preview', async (c) => {
  const user = await currentUser(c.env.DB, c.get('userEmail'));
  const result = await c.env.DB.prepare(
    `INSERT INTO fx_recalculation_jobs (user_id) VALUES (?)`
  ).bind(user.id).run();
  const jobId = Number(result.meta.last_row_id);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM purchases
      WHERE user_id = ? AND original_currency IS NOT NULL AND original_amount IS NOT NULL`
  ).bind(user.id).all<PurchaseRow>();
  for (const purchase of results) await calculateItem(c.env, user, jobId, purchase);
  await refreshJobCounts(c.env.DB, jobId, 'PREVIEW_READY');
  return c.json(await jobResponse(c.env.DB, await ownedJob(c.env.DB, jobId, user.id)), 201);
});

fxRecalculation.get('/latest', async (c) => {
  const user = await currentUser(c.env.DB, c.get('userEmail'));
  const job = await c.env.DB.prepare(
    'SELECT * FROM fx_recalculation_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1'
  ).bind(user.id).first<JobRow>();
  return c.json(job ? await jobResponse(c.env.DB, job) : null);
});

fxRecalculation.get('/admin/jobs', async (c) => {
  const user = await currentUser(c.env.DB, c.get('userEmail'));
  if (user.email !== c.env.ADMIN_EMAIL) throw new ForbiddenError('관리자만 확인할 수 있습니다.');
  const { results } = await c.env.DB.prepare(
    `SELECT j.*, u.email AS user_email
       FROM fx_recalculation_jobs j JOIN users u ON u.id = j.user_id
      ORDER BY j.id DESC LIMIT 100`
  ).all<JobRow & { user_email: string }>();
  return c.json(results.map((row) => ({
    id: row.id, userEmail: row.user_email, status: row.status,
    totalCount: row.total_count, readyCount: row.ready_count,
    failedCount: row.failed_count, appliedCount: row.applied_count, createdAt: row.created_at,
  })));
});

fxRecalculation.get('/:id', async (c) => {
  const user = await currentUser(c.env.DB, c.get('userEmail'));
  const job = await ownedJob(c.env.DB, Number(c.req.param('id')), user.id);
  return c.json(await jobResponse(c.env.DB, job));
});

fxRecalculation.post('/:id/retry', async (c) => {
  const user = await currentUser(c.env.DB, c.get('userEmail'));
  const jobId = Number(c.req.param('id'));
  await ownedJob(c.env.DB, jobId, user.id);
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, i.retry_count FROM fx_recalculation_items i
       JOIN purchases p ON p.id = i.purchase_id
      WHERE i.job_id = ? AND i.status = 'FAILED' AND p.user_id = ?`
  ).bind(jobId, user.id).all<PurchaseRow & { retry_count: number }>();
  for (const purchase of results) await calculateItem(c.env, user, jobId, purchase, purchase.retry_count + 1);
  await refreshJobCounts(c.env.DB, jobId, 'PREVIEW_READY');
  return c.json(await jobResponse(c.env.DB, await ownedJob(c.env.DB, jobId, user.id)));
});

fxRecalculation.post('/:id/apply', async (c) => {
  const user = await currentUser(c.env.DB, c.get('userEmail'));
  const jobId = Number(c.req.param('id'));
  await ownedJob(c.env.DB, jobId, user.id);
  const { results } = await c.env.DB.prepare(
    `SELECT i.* FROM fx_recalculation_items i
       JOIN purchases p ON p.id = i.purchase_id
      WHERE i.job_id = ? AND i.status = 'READY' AND p.user_id = ?`
  ).bind(jobId, user.id).all<ItemRow>();
  if (results.length === 0) throw new BadRequestError('적용할 재계산 결과가 없습니다.');
  for (const item of results) {
    await c.env.DB.prepare(
      `UPDATE purchases SET amount = ?, exchange_rate = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`
    ).bind(item.proposed_amount, item.proposed_exchange_rate, item.purchase_id, user.id).run();
    await recordFxCalculationAudit(c.env.DB, {
      purchaseId: item.purchase_id,
      jobId,
      calculationDate: item.calculation_date,
      originalAmount: item.original_amount,
      originalCurrency: item.original_currency,
      previousAmount: item.before_amount,
      evidence: {
        amountKrw: item.proposed_amount!, rate: item.proposed_exchange_rate!,
        rateSource: item.rate_source as 'EXIMBANK' | 'FRANKFURTER', rateDate: item.rate_date!,
        cardIssuer: item.card_issuer as FxCardIssuer | null,
        cardBrand: item.card_brand as FxCardBrand | null,
        formulaVersion: item.formula_version!, usedFallback: item.used_fallback === 1,
      },
    });
    await c.env.DB.prepare(
      `UPDATE fx_recalculation_items SET status = 'APPLIED', applied_at = datetime('now') WHERE id = ?`
    ).bind(item.id).run();
  }
  const remaining = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM fx_recalculation_items WHERE job_id = ? AND status = 'FAILED'`
  ).bind(jobId).first<{ count: number }>();
  await refreshJobCounts(c.env.DB, jobId, (remaining?.count ?? 0) > 0 ? 'PARTIAL' : 'APPLIED');
  return c.json(await jobResponse(c.env.DB, await ownedJob(c.env.DB, jobId, user.id)));
});

export default fxRecalculation;

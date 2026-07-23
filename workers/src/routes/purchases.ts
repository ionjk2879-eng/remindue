// Mirrors backend/src/main/java/com/remindue/purchase/PurchaseController.java + PurchaseService.java

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { toPurchaseResponse } from '../lib/mapper';
import { FREE_PLAN_MAX_PURCHASES, InvalidPurchaseOperationError, confirmReceiptToday } from '../lib/purchase-logic';
import { buildCsv, buildPdf } from '../lib/export';
import { BadRequestError, ForbiddenError, PaymentRequiredError } from '../lib/errors';
import { PURCHASE_TYPES } from '../types';
import type { Env, PurchaseRequestBody, PurchaseRow, UserRow } from '../types';

const purchases = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
purchases.use('*', authMiddleware);

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

async function getOwnedPurchase(db: D1Database, userId: number, id: number): Promise<PurchaseRow> {
  const purchase = await db.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  if (!purchase) {
    throw new BadRequestError(`항목을 찾을 수 없습니다: ${id}`);
  }
  if (purchase.user_id !== userId) {
    throw new ForbiddenError('본인 소유의 항목만 수정/삭제할 수 있습니다');
  }
  return purchase;
}

function validatePurchaseRequest(body: Partial<PurchaseRequestBody>): PurchaseRequestBody {
  if (!body.type || !PURCHASE_TYPES.includes(body.type)) {
    throw new BadRequestError('type은 ELECTRONICS/ONLINE_ORDER/RECURRING_DELIVERY/SUBSCRIPTION 중 하나여야 합니다');
  }
  if (!body.itemName || !body.itemName.trim()) {
    throw new BadRequestError('itemName은 필수입니다');
  }
  if (!body.baseDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.baseDate)) {
    throw new BadRequestError('baseDate는 yyyy-MM-dd 형식이어야 합니다');
  }
  return {
    type: body.type,
    itemName: body.itemName.trim(),
    baseDate: body.baseDate,
    amount: body.amount ?? null,
    memo: body.memo ?? null,
    warrantyMonths: body.warrantyMonths ?? null,
    returnDeadlineDays: body.returnDeadlineDays ?? null,
    intervalDays: body.intervalDays ?? null,
    scheduleType: body.scheduleType ?? 'INTERVAL',
    fixedDayOfMonth: body.fixedDayOfMonth ?? null,
  };
}

/**
 * 기한이 임박한 순서(D-day 오름차순)로 정렬해서 반환한다. 기본은 활성 항목만(archived_at IS
 * NULL) — 보관함(?archived=true)은 별도 조회다. 조회는 플랜과 무관하게 항상 가능하다(보관
 * "행위"만 프리미엄 전용 — POST /:id/archive 참고).
 */
purchases.get('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const archived = c.req.query('archived') === 'true';
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM purchases WHERE user_id = ? AND archived_at IS ${archived ? 'NOT NULL' : 'NULL'}`
  )
    .bind(user.id)
    .all<PurchaseRow>();

  const responses = results.map(toPurchaseResponse).sort((a, b) => a.dDay - b.dDay);
  return c.json(responses);
});

/** CSV/PDF 내보내기(프리미엄 전용) — 활성+보관 항목을 전부 포함한다(내보내기=이력 전체). */
purchases.get('/export', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  if (user.is_premium !== 1) {
    throw new PaymentRequiredError('CSV/PDF 내보내기는 프리미엄 전용 기능이에요.');
  }

  const format = c.req.query('format');
  if (format !== 'csv' && format !== 'pdf') {
    throw new BadRequestError('format은 csv 또는 pdf여야 합니다');
  }

  const { results } = await c.env.DB.prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at')
    .bind(user.id)
    .all<PurchaseRow>();

  if (format === 'csv') {
    const csv = buildCsv(results);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="remindue_export.csv"',
      },
    });
  }

  const generatedAtLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date()
  );
  const pdfBytes = await buildPdf(results, generatedAtLabel);
  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="remindue_export.pdf"',
    },
  });
});

purchases.post('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = validatePurchaseRequest(await c.req.json<Partial<PurchaseRequestBody>>().catch(() => ({})));

  if (user.is_premium !== 1) {
    const { count } = (await c.env.DB.prepare('SELECT COUNT(*) AS count FROM purchases WHERE user_id = ?')
      .bind(user.id)
      .first<{ count: number }>())!;
    if (count >= FREE_PLAN_MAX_PURCHASES) {
      throw new PaymentRequiredError(
        `무료 플랜은 최대 ${FREE_PLAN_MAX_PURCHASES}개까지 등록 가능해요. 무제한으로 이용하려면 프리미엄으로 업그레이드하세요.`
      );
    }
  }

  // lastDeliveredDate는 이제 "마지막 수령 확인" 참고 로그일 뿐 배송일 계산에 쓰이지 않으므로,
  // 등록 시점엔 아직 아무것도 확인된 게 없다는 뜻으로 null로 둔다.
  const lastDeliveredDate = null;

  const insert = await c.env.DB.prepare(
    `INSERT INTO purchases
       (user_id, type, item_name, base_date, amount, memo, warranty_months, return_deadline_days, interval_days, schedule_type, fixed_day_of_month, last_delivered_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      user.id,
      body.type,
      body.itemName,
      body.baseDate,
      body.amount,
      body.memo,
      body.warrantyMonths,
      body.returnDeadlineDays,
      body.intervalDays,
      body.scheduleType,
      body.fixedDayOfMonth,
      lastDeliveredDate
    )
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?')
    .bind(insert.meta.last_row_id)
    .first<PurchaseRow>();

  return c.json(toPurchaseResponse(created!));
});

purchases.put('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);
  const body = validatePurchaseRequest(await c.req.json<Partial<PurchaseRequestBody>>().catch(() => ({})));

  await c.env.DB.prepare(
    `UPDATE purchases
        SET type = ?, item_name = ?, base_date = ?, amount = ?, memo = ?,
            warranty_months = ?, return_deadline_days = ?, interval_days = ?,
            schedule_type = ?, fixed_day_of_month = ?,
            updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(
      body.type,
      body.itemName,
      body.baseDate,
      body.amount,
      body.memo,
      body.warrantyMonths,
      body.returnDeadlineDays,
      body.intervalDays,
      body.scheduleType,
      body.fixedDayOfMonth,
      id
    )
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

purchases.delete('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);

  await c.env.DB.prepare('DELETE FROM purchases WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

/**
 * 정기배송 전용 — "이번 회차 수령 확인" 처리. last_delivered_date에 참고용 로그만 남기고,
 * 다음 배송일(고정 스케줄) 계산에는 영향을 주지 않는다.
 */
purchases.post('/:id/mark-delivered', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const existing = await getOwnedPurchase(c.env.DB, user.id, id);

  let today: string;
  try {
    today = confirmReceiptToday(existing.type);
  } catch (e) {
    if (e instanceof InvalidPurchaseOperationError) throw new BadRequestError(e.message);
    throw e;
  }

  await c.env.DB.prepare(
    `UPDATE purchases
        SET last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(today, id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/**
 * 이력 보관(프리미엄 전용) — 삭제 대신 archived_at을 채운다. 보관된 항목은 기본 목록
 * 조회(GET /)와 D-day 알림 대상에서 빠지지만 ?archived=true로 계속 조회할 수 있다.
 */
purchases.post('/:id/archive', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  if (user.is_premium !== 1) {
    throw new PaymentRequiredError('보관 기능은 프리미엄 전용이에요. 무료 플랜은 삭제만 가능해요.');
  }
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);

  await c.env.DB.prepare(`UPDATE purchases SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/**
 * 보관 해제 — 다운그레이드 이후에도(더는 새로 보관은 못 해도) 예전에 보관해둔 항목을 다시
 * 활성 목록으로 꺼내오는 건 항상 가능해야 하므로 프리미엄 게이트를 걸지 않는다.
 */
purchases.post('/:id/unarchive', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);

  await c.env.DB.prepare(`UPDATE purchases SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?`).bind(id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

export default purchases;

// Mirrors backend/src/main/java/com/remindue/purchase/PurchaseController.java + PurchaseService.java

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { toPurchaseResponse } from '../lib/mapper';
import { InvalidPurchaseOperationError, confirmReceiptToday } from '../lib/purchase-logic';
import { BadRequestError, ForbiddenError } from '../lib/errors';
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
    throw new BadRequestError('type은 ELECTRONICS/ONLINE_ORDER/RECURRING_DELIVERY 중 하나여야 합니다');
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
  };
}

/** 기한이 임박한 순서(D-day 오름차순)로 정렬해서 반환한다. */
purchases.get('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const { results } = await c.env.DB.prepare('SELECT * FROM purchases WHERE user_id = ?')
    .bind(user.id)
    .all<PurchaseRow>();

  const responses = results.map(toPurchaseResponse).sort((a, b) => a.dDay - b.dDay);
  return c.json(responses);
});

purchases.post('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = validatePurchaseRequest(await c.req.json<Partial<PurchaseRequestBody>>().catch(() => ({})));

  // lastDeliveredDate는 이제 "마지막 수령 확인" 참고 로그일 뿐 배송일 계산에 쓰이지 않으므로,
  // 등록 시점엔 아직 아무것도 확인된 게 없다는 뜻으로 null로 둔다.
  const lastDeliveredDate = null;

  const insert = await c.env.DB.prepare(
    `INSERT INTO purchases
       (user_id, type, item_name, base_date, amount, memo, warranty_months, return_deadline_days, interval_days, last_delivered_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

  // Purchase.update()와 동일하게 type은 변경하지 않는다.
  await c.env.DB.prepare(
    `UPDATE purchases
        SET item_name = ?, base_date = ?, amount = ?, memo = ?,
            warranty_months = ?, return_deadline_days = ?, interval_days = ?,
            updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(
      body.itemName,
      body.baseDate,
      body.amount,
      body.memo,
      body.warrantyMonths,
      body.returnDeadlineDays,
      body.intervalDays,
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

export default purchases;

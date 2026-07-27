// Mirrors backend/src/main/java/com/remindue/purchase/PurchaseController.java + PurchaseService.java

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { toPurchaseResponse } from '../lib/mapper';
import { refreshRecurringFxOnConfirmation } from '../lib/recurring-fx';
import { computeDDay, computeDeadline, FREE_PLAN_MAX_PURCHASES, InvalidPurchaseOperationError, confirmReceiptToday } from '../lib/purchase-logic';
import { sanitizeBrandDomain, sanitizeCategoryTags, sanitizeCurrency, sanitizeOriginalAmount } from '../lib/pending-purchase-intake';
import { buildCsv, buildPdf } from '../lib/export';
import { BadRequestError, ForbiddenError, PaymentRequiredError } from '../lib/errors';
import { isRecurringType, PURCHASE_CATEGORIES, PURCHASE_TYPES } from '../types';
import type { Env, PurchaseRequestBody, PurchaseRow, UserRow } from '../types';

const purchases = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
purchases.use('*', authMiddleware);

/**
 * "전체 확인"은 밀린 회차를 한 번에 모두 유지한 것으로 기록한다. 다음 예정 회차는
 * 확인하지 않은 채 남겨 둬야 하므로, 오늘 회차가 시작되었을 때만 그 회차까지 포함한다.
 */
function confirmedRoundsAfterConfirmAll(row: PurchaseRow): number {
  const { deadline, deliveryRound } = computeDeadline(row);
  if (deliveryRound === null) return row.delivery_confirm_count;

  const confirmableRounds = computeDDay(deadline) <= 0 ? deliveryRound : deliveryRound - 1;
  return Math.max(row.delivery_confirm_count, confirmableRounds, 0);
}

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
    throw new BadRequestError('type은 GENERAL/RECURRING_DELIVERY/SUBSCRIPTION 중 하나여야 합니다');
  }
  if (!body.itemName || !body.itemName.trim()) {
    throw new BadRequestError('itemName은 필수입니다');
  }
  if (!body.baseDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.baseDate)) {
    throw new BadRequestError('baseDate는 yyyy-MM-dd 형식이어야 합니다');
  }
  if (body.expectedDeliveryDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.expectedDeliveryDate)) {
    throw new BadRequestError('expectedDeliveryDate는 yyyy-MM-dd 형식이어야 합니다');
  }
  // SUBSCRIPTION은 실물 배송이 없어 도착일 개념 자체가 없다 — 값이 와도 저장하지 않는다.
  // GENERAL은 반품기한·A/S보증 기산일로, RECURRING_DELIVERY는 배송 사이클 앵커로 실제 쓰인다
  // (둘 다 purchase-logic.ts computeDeadlines의 arrivalAnchor).
  const expectedDeliveryDate = body.type !== 'SUBSCRIPTION' ? (body.expectedDeliveryDate ?? null) : null;
  // 일반 구매에는 반복 여부가 없으므로 무시한다. 정기 항목의 1회 사용은 "유지 안 함"과 달리
  // 목록을 보존하되 이후 회차만 만들지 않는 별도 상태다.
  const isOneTime = isRecurringType(body.type) && body.isOneTime === true;
  // 카테고리는 이제 모든 구매 유형에 적용된다.
  const category = body.category && PURCHASE_CATEGORIES.includes(body.category) ? body.category : null;
  const categoryTags = category ? sanitizeCategoryTags(body.categoryTags, category) : [];
  const brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  const originalCurrency = sanitizeCurrency(body.originalCurrency ?? null);
  const originalAmount = sanitizeOriginalAmount(originalCurrency, body.originalAmount ?? null);
  const exchangeRate =
    originalCurrency && originalAmount !== null && typeof body.exchangeRate === 'number' && Number.isFinite(body.exchangeRate) && body.exchangeRate > 0
      ? body.exchangeRate
      : null;
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
    isOneTime,
    expectedDeliveryDate,
    category,
    categoryTags,
    brand: brand,
    brandDomain: sanitizeBrandDomain(brand, body.brandDomain ?? null),
    originalAmount,
    originalCurrency,
    exchangeRate,
  };
}

/**
 * 기한이 임박한 순서(D-day 오름차순)로 반환한다. 기본은 활성 항목만(archived_at IS NULL AND
 * discarded_at IS NULL) — 보관함(?archived=true)은 별도 조회다. discard된("삭제") 항목은 둘
 * 중 어느 쪽에도 안 잡힌다 — 목록에서는 완전히 빠지되 지출 통계에는 남아야 하므로, 그 용도는
 * ?scope=spend로 전부(활성+보관+삭제, 하드 삭제된 것만 제외) 가져간다(월별/연간 지출 집계
 * 전용 — 대시보드는 이 응답을 카드로 렌더링하지 않는다). 조회는 플랜과 무관하게 항상
 * 가능하다(보관 "행위"만 프리미엄 전용 — POST /:id/archive 참고).
 */
purchases.get('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const scope = c.req.query('scope');
  const archived = c.req.query('archived') === 'true';

  const where =
    scope === 'spend'
      ? 'user_id = ?'
      : `user_id = ? AND archived_at IS ${archived ? 'NOT NULL' : 'NULL'} AND discarded_at IS NULL`;

  const { results } = await c.env.DB.prepare(`SELECT * FROM purchases WHERE ${where}`).bind(user.id).all<PurchaseRow>();

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
       (user_id, type, item_name, base_date, amount, memo, warranty_months, return_deadline_days, interval_days, schedule_type, fixed_day_of_month, is_one_time, expected_delivery_date, last_delivered_date, category, category_tags, brand, brand_domain, original_amount, original_currency, exchange_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      body.isOneTime ? 1 : 0,
      body.expectedDeliveryDate,
      lastDeliveredDate,
      body.category,
      JSON.stringify(body.categoryTags),
      body.brand,
      body.brandDomain,
      body.originalAmount,
      body.originalCurrency,
      body.exchangeRate
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
            schedule_type = ?, fixed_day_of_month = ?, is_one_time = ?, expected_delivery_date = ?,
            category = ?, category_tags = ?, brand = ?, brand_domain = ?,
            original_amount = ?, original_currency = ?, exchange_rate = ?,
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
      body.isOneTime ? 1 : 0,
      body.expectedDeliveryDate,
      body.category,
      JSON.stringify(body.categoryTags),
      body.brand,
      body.brandDomain,
      body.originalAmount,
      body.originalCurrency,
      body.exchangeRate,
      id
    )
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/**
 * "취소"(삭제와 다름) — 잘못 등록했거나, 주문 자체가 취소됐거나, 배송/결제 후 환불받아서 실제
 * 지출로 칠 필요가 없는 경우. 하드 삭제라 지출 통계에서도 완전히 빠진다. 이미 실제로 발생한
 * 지출을 목록에서만 치우고 싶을 땐 이걸 쓰지 말고 POST /:id/discard("삭제")를 쓴다.
 */
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
        SET last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1,
            stop_after_current_at = NULL, discontinued_at = NULL, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(today, id)
    .run();
  await refreshRecurringFxOnConfirmation(c.env.DB, existing);

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/**
 * "이번 회차 확인"(유지하기)을 여러 건 한 번에 처리 — 확인이 필요한 항목을 하나씩 누르는 게
 * 불편하다는 피드백으로 추가. 밀린 회차가 여러 번이어도 모두 유지한 것으로 처리하고,
 * 다음 예정 회차만 미확인으로 남긴다.
 */
purchases.post('/confirm-all', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ ids?: number[] }>().catch(() => ({}) as { ids?: number[] });
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => Number.isInteger(id)) : [];
  if (ids.length === 0) throw new BadRequestError('ids는 1개 이상의 정수 배열이어야 합니다');

  const owned: PurchaseRow[] = [];
  for (const id of ids) {
    owned.push(await getOwnedPurchase(c.env.DB, user.id, id));
  }
  for (const row of owned) {
    if (!isRecurringType(row.type)) {
      throw new BadRequestError('정기구독·배송 항목만 일괄 확인할 수 있습니다');
    }
  }

  const today = confirmReceiptToday('SUBSCRIPTION');
  await c.env.DB.batch(
    owned.map((row) =>
      c.env.DB.prepare(
        `UPDATE purchases
            SET last_delivered_date = ?, delivery_confirm_count = ?,
                stop_after_current_at = NULL, discontinued_at = NULL, updated_at = datetime('now')
          WHERE id = ?`
      ).bind(today, confirmedRoundsAfterConfirmAll(row), row.id)
    )
  );
  await Promise.all(owned.map((row) => refreshRecurringFxOnConfirmation(c.env.DB, row)));

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM purchases WHERE id IN (${owned.map(() => '?').join(',')})`
  )
    .bind(...owned.map((row) => row.id))
    .all<PurchaseRow>();

  return c.json(results.map(toPurchaseResponse));
});

/**
 * "유지 안 함" — 사용자가 명시적으로 "더 이상 안 쓴다"고 표시. discontinued_at을 채운다.
 * 미확인(침묵)과 구분되는 확실한 신호라 AI 절약 후보 판정에서 더 높은 확신으로 취급된다.
 * mark-delivered를 다시 누르면(재사용 재개) discontinued_at은 NULL로 되돌아간다.
 */
purchases.post('/:id/discontinue', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const existing = await getOwnedPurchase(c.env.DB, user.id, id);
  if (!isRecurringType(existing.type)) {
    throw new BadRequestError('정기구독·배송 항목에서만 "유지 안 함"을 표시할 수 있습니다');
  }

  await c.env.DB.prepare(
    `UPDATE purchases SET discontinued_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  )
    .bind(id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/** 반품 신청/A·S 접수 뒤에는 해당 일반구매의 남은 기한 알림을 모두 끈다. */
purchases.post('/:id/disable-deadline-notifications', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const existing = await getOwnedPurchase(c.env.DB, user.id, id);
  if (existing.type !== 'GENERAL') throw new BadRequestError('일반구매 항목의 기한 알림만 끌 수 있습니다.');
  await c.env.DB.prepare(
    `UPDATE purchases SET deadline_notifications_disabled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).bind(id).run();
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

/**
 * "삭제"(취소와 다름, 무료 포함 누구나) — DELETE(하드 삭제, "취소")와 달리 실제로 발생한
 * 지출이므로 행 자체는 남기고 discarded_at만 채운다. 목록(활성/보관 어느 쪽 조회에도)과
 * D-day/확인 알림 대상에서는 완전히 빠지지만, 월별·연간 지출 집계(?scope=spend, CSV/PDF
 * export)에서는 계속 잡힌다. 되돌리는 UI는 없다 — discard된 항목은 어디서도 다시 안 보인다.
 */
purchases.post('/:id/discard', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);

  await c.env.DB.prepare(`UPDATE purchases SET discarded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  return c.body(null, 204);
});

/** "지난 항목" 탭의 "전체 삭제" — POST /:id/discard의 일괄 처리 버전(confirm-all과 동일한 패턴). */
purchases.post('/discard-all', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ ids?: number[] }>().catch(() => ({}) as { ids?: number[] });
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => Number.isInteger(id)) : [];
  if (ids.length === 0) throw new BadRequestError('ids는 1개 이상의 정수 배열이어야 합니다');

  const owned: PurchaseRow[] = [];
  for (const id of ids) {
    owned.push(await getOwnedPurchase(c.env.DB, user.id, id));
  }

  await c.env.DB.batch(
    owned.map((row) =>
      c.env.DB.prepare(`UPDATE purchases SET discarded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(row.id)
    )
  );

  return c.body(null, 204);
});

export default purchases;

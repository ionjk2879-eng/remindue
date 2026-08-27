// Mirrors backend/src/main/java/com/remindue/purchase/PurchaseController.java + PurchaseService.java

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { toPurchaseResponse } from '../lib/mapper';
import { getPaymentHistoryByPurchaseIds, recordConfirmedPaymentCycle } from '../lib/recurring-fx';
import { computeDDay, computeDeadline, computeDeadlineAt, InvalidPurchaseOperationError, confirmReceiptToday, recomputeRoundOffsetForEdit } from '../lib/purchase-logic';
import {
  convertToKrw,
  sanitizeBrandDomain,
  sanitizeCategoryTags,
  sanitizeCurrency,
  sanitizeOriginalAmount,
} from '../lib/pending-purchase-intake';
import { estimateTravelCardAmount, type FxCardBrand, type FxCardIssuer } from '../lib/fx-card';
import { buildCsv, buildPdf } from '../lib/export';
import { BadRequestError, ForbiddenError } from '../lib/errors';
import { recordFxCalculationAudit, type FxCalculationEvidence } from '../lib/fx-audit';
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

async function resumePurchaseSchedule(db: D1Database, existing: PurchaseRow): Promise<PurchaseRow> {
  const currentRound = computeDeadline(existing).deliveryRound ?? 1;
  const previousRound = existing.discontinued_round
    ?? computeDeadlineAt(existing, existing.discontinued_at!.slice(0, 10)).deliveryRound
    ?? currentRound;
  const desiredRound = previousRound + 1;
  const nextOffset = (existing.delivery_round_offset ?? 0) + currentRound - desiredRound;
  const pausePeriods = (() => {
    try {
      const parsed = JSON.parse(existing.schedule_pause_periods || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  pausePeriods.push({ from: existing.discontinued_at!.slice(0, 10), to: confirmReceiptToday(existing.type) });

  await db.prepare(
    `UPDATE purchases
        SET discontinued_at = NULL, discontinued_round = NULL, delivery_round_offset = ?,
            schedule_pause_periods = ?, stop_after_current_at = NULL, renewal_decision_for = NULL,
            updated_at = datetime('now')
      WHERE id = ?`
  ).bind(nextOffset, JSON.stringify(pausePeriods), existing.id).run();

  return (await db.prepare('SELECT * FROM purchases WHERE id = ?').bind(existing.id).first<PurchaseRow>())!;
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
  // 도착예정 추정(computeArrivalEstimate)은 실물 배송이 있는 RECURRING_DELIVERY에서만 의미가
  // 있다 — 다른 타입이면 값이 와도 저장하지 않는다.
  const arrivalOffsetDays = body.type === 'RECURRING_DELIVERY' ? (body.arrivalOffsetDays ?? null) : null;
  // FIXED_DAY + 오프셋 조합은 도착 앵커(expectedDeliveryDate)의 "일(day)"을 스케줄의 진짜 고정
  // 앵커로 쓴다(purchase-logic.ts arrivalAnchoredCycleFor) — 앵커가 없으면 baseDate(결제일)로
  // 잘못 폴백해 도착일과 결제일이 뒤섞인 채 계산된다. 반드시 도착일을 직접 입력받아야 한다.
  if (arrivalOffsetDays !== null && (body.scheduleType ?? 'INTERVAL') === 'FIXED_DAY' && !expectedDeliveryDate) {
    throw new BadRequestError('영업일 오프셋을 설정하려면 도착예정일(expectedDeliveryDate)도 함께 입력해야 합니다');
  }
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
    fixedDayIntervalMonths: body.fixedDayIntervalMonths ?? 1,
    isOneTime,
    expectedDeliveryDate,
    arrivalOffsetDays,
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
 * 직접 등록/수정한 외화 결제도 이메일 자동 등록과 같은 방식으로 환산한다.
 * baseDate는 사용자가 입력한 실제 결제일이므로, 서비스 브랜드와 관계없이 그 날짜의 환율을 쓴다.
 * 클라이언트가 보낸 amount/exchangeRate는 신뢰하지 않고 서버 계산값으로 덮어쓴다.
 */
async function applyPaymentDateExchangeRate(
  body: PurchaseRequestBody,
  user: UserRow,
  eximApiKey?: string
): Promise<{ body: PurchaseRequestBody; evidence: FxCalculationEvidence | null }> {
  if (!body.originalCurrency || typeof body.originalAmount !== 'number') return { body, evidence: null };
  const originalAmount = body.originalAmount;

  const converted = await convertToKrw(
    body.originalCurrency,
    originalAmount,
    body.baseDate,
    user.fx_card_issuer as FxCardIssuer | null,
    user.fx_card_brand as FxCardBrand | null,
    eximApiKey
  );
  if (!converted) {
    throw new BadRequestError('결제일 기준 환율을 조회하지 못했습니다. 날짜와 통화를 확인해 주세요.');
  }

  return { body: { ...body, amount: converted.amountKrw, exchangeRate: converted.rate }, evidence: converted };
}

/**
 * 기한이 임박한 순서(D-day 오름차순)로 반환한다.
 * - 기본(archived 미지정): archived_at IS NULL인 항목 전부 — discarded(삭제)된 항목 포함.
 *   클라이언트가 discardedAt 필드로 "지난 항목" 탭에 배치하고, 활성 목록에서는 걸러낸다.
 * - ?archived=true(보관함): archived_at IS NOT NULL AND discarded_at IS NULL 항목만.
 * - ?scope=spend(지출 집계): 하드 삭제된 것 외 전부(활성+보관+discard 모두 포함) — 카드 렌더링 없이
 *   월별·연간 지출 집계만 쓴다. 조회는 플랜과 무관하게 항상 가능하다.
 */
purchases.get('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const scope = c.req.query('scope');
  const archived = c.req.query('archived') === 'true';

  const where =
    scope === 'spend'
      ? 'user_id = ?'
      : archived
        ? `user_id = ? AND archived_at IS NOT NULL AND discarded_at IS NULL`
        : `user_id = ? AND archived_at IS NULL`;

  const { results } = await c.env.DB.prepare(`SELECT * FROM purchases WHERE ${where}`).bind(user.id).all<PurchaseRow>();

  // 지출 집계(scope=spend)만 월별 실제 결제 이력을 함께 내려준다 — 카드 목록 등 다른 조회는
  // 이 값이 필요 없어 불필요한 조회를 피한다.
  const historyByPurchaseId =
    scope === 'spend' ? await getPaymentHistoryByPurchaseIds(c.env.DB, results.map((row) => row.id)) : new Map();

  const responses = results
    .map((row) => {
      const response = toPurchaseResponse(row, historyByPurchaseId.get(row.id) ?? []);
      if (row.amount === null || row.original_amount === null) return response;
      return {
        ...response,
        travelCardAmount: estimateTravelCardAmount(
          row.amount,
          row.original_amount,
          user.fx_card_issuer as FxCardIssuer | null,
          user.fx_card_brand as FxCardBrand | null,
        ),
      };
    })
    .sort((a, b) => a.dDay - b.dDay);
  return c.json(responses);
});

/** CSV/PDF 내보내기 — 활성+보관 항목을 전부 포함한다(내보내기=이력 전체). */
purchases.get('/export', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));

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
  const validated = validatePurchaseRequest(await c.req.json<Partial<PurchaseRequestBody>>().catch(() => ({})));
  const { body, evidence } = await applyPaymentDateExchangeRate(validated, user, c.env.KOREA_EXIM_API_KEY);

  // lastDeliveredDate는 이제 "마지막 수령 확인" 참고 로그일 뿐 배송일 계산에 쓰이지 않으므로,
  // 등록 시점엔 아직 아무것도 확인된 게 없다는 뜻으로 null로 둔다.
  const lastDeliveredDate = null;

  const insert = await c.env.DB.prepare(
    `INSERT INTO purchases
       (user_id, type, item_name, base_date, amount, memo, warranty_months, return_deadline_days, interval_days, schedule_type, fixed_day_of_month, fixed_day_interval_months, is_one_time, expected_delivery_date, arrival_offset_days, last_delivered_date, category, category_tags, brand, brand_domain, original_amount, original_currency, exchange_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      body.fixedDayIntervalMonths,
      body.isOneTime ? 1 : 0,
      body.expectedDeliveryDate,
      body.arrivalOffsetDays,
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

  if (evidence && typeof body.originalAmount === 'number' && body.originalCurrency) {
    await recordFxCalculationAudit(c.env.DB, {
      purchaseId: Number(insert.meta.last_row_id), calculationDate: body.baseDate,
      originalAmount: body.originalAmount, originalCurrency: body.originalCurrency,
      previousAmount: null, evidence,
    });
  }

  return c.json(toPurchaseResponse(created!));
});

purchases.put('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const existing = await getOwnedPurchase(c.env.DB, user.id, id);
  const validated = validatePurchaseRequest(await c.req.json<Partial<PurchaseRequestBody>>().catch(() => ({})));
  const { body, evidence } = await applyPaymentDateExchangeRate(validated, user, c.env.KOREA_EXIM_API_KEY);

  const deliveryRoundOffset = recomputeRoundOffsetForEdit(existing, {
    type: body.type,
    base_date: body.baseDate,
    warranty_months: body.warrantyMonths ?? null,
    return_deadline_days: body.returnDeadlineDays ?? null,
    interval_days: body.intervalDays ?? null,
    schedule_type: body.scheduleType ?? 'INTERVAL',
    fixed_day_of_month: body.fixedDayOfMonth ?? null,
    fixed_day_interval_months: body.fixedDayIntervalMonths ?? 1,
    is_one_time: body.isOneTime ? 1 : 0,
    expected_delivery_date: body.expectedDeliveryDate ?? null,
    arrival_offset_days: body.arrivalOffsetDays ?? null,
  });

  await c.env.DB.prepare(
    `UPDATE purchases
        SET type = ?, item_name = ?, base_date = ?, amount = ?, memo = ?,
            warranty_months = ?, return_deadline_days = ?, interval_days = ?,
            schedule_type = ?, fixed_day_of_month = ?, fixed_day_interval_months = ?, is_one_time = ?, expected_delivery_date = ?,
            arrival_offset_days = ?, delivery_round_offset = ?,
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
      body.fixedDayIntervalMonths,
      body.isOneTime ? 1 : 0,
      body.expectedDeliveryDate,
      body.arrivalOffsetDays,
      deliveryRoundOffset,
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

  if (evidence && typeof body.originalAmount === 'number' && body.originalCurrency) {
    await recordFxCalculationAudit(c.env.DB, {
      purchaseId: id, calculationDate: body.baseDate,
      originalAmount: body.originalAmount, originalCurrency: body.originalCurrency,
      previousAmount: existing.amount, evidence,
    });
  }

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

  // renewal_decision_for도 같이 채워야 confirmation-nudge.ts의 "당일 유지 확인" 알림이 이미
  // 대시보드에서 답한 회차를 또 물어보지 않는다 — 이 값은 원래 푸시 액션 버튼(routes/push.ts의
  // recurring-batch)에서만 채워졌는데, 대시보드에서 직접 누른 경우엔 안 채워져서 이미 답한 회차도
  // 다시 알림이 갔다. confirmReceiptToday가 이미 recurring 타입만 통과시키므로 여기선 항상 계산된다.
  const renewalDecisionFor = computeDeadline(existing).deadline;
  await c.env.DB.prepare(
    `UPDATE purchases
        SET last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1,
            renewal_decision_for = ?,
            stop_after_current_at = NULL, discontinued_at = NULL, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(today, renewalDecisionFor, id)
    .run();
  await recordConfirmedPaymentCycle(c.env.DB, existing, c.env.KOREA_EXIM_API_KEY);

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
  // renewal_decision_for도 같이 채운다 — mark-delivered와 같은 이유(위 주석 참고).
  await c.env.DB.batch(
    owned.map((row) =>
      c.env.DB.prepare(
        `UPDATE purchases
            SET last_delivered_date = ?, delivery_confirm_count = ?,
                renewal_decision_for = ?,
                stop_after_current_at = NULL, discontinued_at = NULL, updated_at = datetime('now')
          WHERE id = ?`
      ).bind(today, confirmedRoundsAfterConfirmAll(row), computeDeadline(row).deadline, row.id)
    )
  );
  await Promise.all(owned.map((row) => recordConfirmedPaymentCycle(c.env.DB, row, c.env.KOREA_EXIM_API_KEY)));

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM purchases WHERE id IN (${owned.map(() => '?').join(',')})`
  )
    .bind(...owned.map((row) => row.id))
    .all<PurchaseRow>();

  return c.json(results.map((row) => toPurchaseResponse(row)));
});

/**
 * "유지 안 함" — 사용자가 명시적으로 "더 이상 안 쓴다"고 표시. discontinued_at을 채운다.
 * 미확인(침묵)과 구분되는 확실한 신호라 AI 절약 후보 판정에서 더 높은 확신으로 취급된다.
 * 재개는 /:id/resume에서 별도로 처리해 중단 구간과 연속 회차를 보존한다.
 */
purchases.post('/:id/discontinue', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const existing = await getOwnedPurchase(c.env.DB, user.id, id);
  if (!isRecurringType(existing.type)) {
    throw new BadRequestError('정기구독·배송 항목에서만 "유지 안 함"을 표시할 수 있습니다');
  }

  const discontinuedRound = computeDeadline(existing).deliveryRound;
  await c.env.DB.prepare(
    `UPDATE purchases
        SET discontinued_at = datetime('now'), discontinued_round = ?, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(discontinuedRound, id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/** 중단했던 동일 항목을 재개한다. 중단 중 예정됐던 회차는 건너뛰고 직전 회차 다음부터 잇는다. */
purchases.post('/:id/resume', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const existing = await getOwnedPurchase(c.env.DB, user.id, id);

  // 구버전 클라이언트는 재개 버튼으로 이 경로를 호출한다. 결제 확인으로 기록하지 말고 새 재개
  // 처리와 동일하게 중단 구간·연속 회차를 보존한다.
  if (existing.discontinued_at !== null) {
    return c.json(toPurchaseResponse(await resumePurchaseSchedule(c.env.DB, existing)));
  }
  if (!isRecurringType(existing.type)) {
    throw new BadRequestError('정기구독·배송 항목에서만 재개할 수 있습니다');
  }
  if (existing.discontinued_at === null) {
    throw new BadRequestError('중단된 항목만 재개할 수 있습니다');
  }

  return c.json(toPurchaseResponse(await resumePurchaseSchedule(c.env.DB, existing)));
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
 * 이력 보관 — 삭제 대신 archived_at을 채운다. 보관된 항목은 기본 목록
 * 조회(GET /)와 D-day 알림 대상에서 빠지지만 ?archived=true로 계속 조회할 수 있다.
 */
purchases.post('/:id/archive', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);

  await c.env.DB.prepare(`UPDATE purchases SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
});

/** 보관 해제 — 예전에 보관해둔 항목을 다시 활성 목록으로 꺼내온다. */
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
 * 지출이므로 행 자체는 남기고 discarded_at만 채운다. 활성 목록에서는 빠지고 D-day/확인 알림
 * 대상에서도 제외되지만, "지난 항목" 탭에는 계속 보인다(GET / 기본 조회가 discarded_at IS NOT NULL
 * 항목도 반환하므로 — 클라이언트가 discardedAt 필드로 분류). 복원하려면 POST /:id/undiscard.
 * 월별·연간 지출 집계(?scope=spend)에는 계속 잡힌다.
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

/** "지난 항목" 탭에서 "복원" — discarded_at을 지워 활성 목록으로 되돌린다. */
purchases.post('/:id/undiscard', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPurchase(c.env.DB, user.id, id);

  await c.env.DB.prepare(`UPDATE purchases SET discarded_at = NULL, updated_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(id).first<PurchaseRow>();
  return c.json(toPurchaseResponse(updated!));
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

// email-intake.ts(이메일 포워딩)와 routes/purchases.ts의 이미지 분석 라우트가 공유하는
// "AI 추출 결과 → pending_purchases 행" 변환 로직. AI가 준 값을 그대로 믿지 않고 항상
// sanitize를 거쳐 저장한다(모델이 스키마를 벗어난 값을 줄 수 있으므로).

import { DEFAULT_RETURN_DEADLINE_DAYS, DEFAULT_INTERVAL_DAYS } from './purchase-logic';
import { isRecurringType, PURCHASE_TYPES, type PurchaseType } from '../types';
import type { ExtractedOrder } from './order-extraction';

/** AI가 준 종류 추정값이 유효한 4종 중 하나가 아니면(모델 오류 등) 안전하게 기본값으로 되돌린다. */
export function sanitizeEstimatedType(value: string | null): PurchaseType {
  return PURCHASE_TYPES.includes(value as PurchaseType) ? (value as PurchaseType) : 'ONLINE_ORDER';
}

/** AI가 준 반품기한 일수가 비정상(0 이하 등)이면 안전하게 기본값으로 되돌린다. */
export function sanitizeReturnDeadlineDays(days: number | null): number {
  return typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : DEFAULT_RETURN_DEADLINE_DAYS;
}

/** AI가 준 매월 결제/배송일이 1~31 범위를 벗어나면(모델 오류 등) null로 되돌린다.
 *  스키마 자체에는 범위 제약을 걸 수 없어(Anthropic 구조화 출력이 integer의 min/max 미지원)
 *  여기서 후처리로 검증한다. */
export function sanitizeFixedDayOfMonth(day: number | null): number | null {
  return typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

/** AI가 준 금액이 비정상(음수·소수 등)이면 null로 되돌린다 — 0은 실제로 무료/이벤트 배송일 수 있어 유효하게 둔다. */
export function sanitizeAmount(amount: number | null): number | null {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 ? amount : null;
}

export interface PendingPurchaseFields {
  type: PurchaseType;
  returnDeadlineDays: number;
  returnDeadlineEstimated: 0 | 1;
  intervalDays: number | null;
  scheduleType: 'INTERVAL' | 'FIXED_DAY';
  fixedDayOfMonth: number | null;
  scheduleEstimated: 0 | 1;
  amount: number | null;
}

/** ExtractedOrder(AI 원시 응답)를 pending_purchases에 저장할 안전한 필드로 변환한다. */
export function buildPendingPurchaseFields(extracted: ExtractedOrder): PendingPurchaseFields {
  const type = sanitizeEstimatedType(extracted.estimatedType);

  // 반품기한이 원본에 구체적으로 명시되지 않았으면 전자상거래법 최소 기준(7일)으로 채우고
  // returnDeadlineEstimated=1로 표시해서 확인 대기 화면에서 "추정값" 경고를 보여줄 수 있게 한다.
  const returnDeadlineDays = extracted.foundExplicitDeadline
    ? sanitizeReturnDeadlineDays(extracted.returnDeadlineDays)
    : DEFAULT_RETURN_DEADLINE_DAYS;
  const returnDeadlineEstimated: 0 | 1 = extracted.foundExplicitDeadline ? 0 : 1;

  const requestedScheduleType = isRecurringType(type) ? extracted.scheduleType ?? 'INTERVAL' : 'INTERVAL';
  const sanitizedFixedDay =
    requestedScheduleType === 'FIXED_DAY' ? sanitizeFixedDayOfMonth(extracted.fixedDayOfMonth) : null;

  // FIXED_DAY인데 fixedDayOfMonth가 sanitize에서 걸러졌으면(모델 오류) INTERVAL 추정치로 폴백한다 —
  // 이 시점 이후로는 scheduleType이 확정값이다.
  const scheduleType: 'INTERVAL' | 'FIXED_DAY' = requestedScheduleType === 'FIXED_DAY' && sanitizedFixedDay === null
    ? 'INTERVAL'
    : requestedScheduleType;
  const fixedDayOfMonth = scheduleType === 'FIXED_DAY' ? sanitizedFixedDay : null;

  // INTERVAL로 확정됐는데 intervalDays가 없으면 — 원본에 주기가 전혀 없었다는 뜻이므로 30일
  // 기본 추정치로 채우고 scheduleEstimated=1로 표시한다. AI가 이미 scheduleEstimated=true를 준
  // 경우, 또는 FIXED_DAY에서 방금 폴백해온 경우도 여기서 함께 추정치 취급된다.
  const intervalDays = isRecurringType(type) && scheduleType === 'INTERVAL' ? extracted.intervalDays ?? DEFAULT_INTERVAL_DAYS : null;
  const scheduleEstimated: 0 | 1 =
    isRecurringType(type) &&
    (extracted.scheduleEstimated || (scheduleType === 'INTERVAL' && extracted.intervalDays === null))
      ? 1
      : 0;

  return {
    type,
    returnDeadlineDays,
    returnDeadlineEstimated,
    intervalDays,
    scheduleType,
    fixedDayOfMonth,
    scheduleEstimated,
    amount: sanitizeAmount(extracted.amount),
  };
}

/** 삽입된 pending_purchases.id를 반환한다 — 호출부가 바로 조회해 응답에 쓸 수 있게. */
export async function insertPendingPurchase(
  db: D1Database,
  userId: number,
  source: 'email' | 'image',
  extracted: ExtractedOrder
): Promise<number> {
  const fields = buildPendingPurchaseFields(extracted);

  const result = await db
    .prepare(
      `INSERT INTO pending_purchases
         (user_id, source, type, item_name, order_date, expected_delivery_date, return_deadline_days, return_deadline_estimated, interval_days, schedule_type, fixed_day_of_month, schedule_estimated, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      userId,
      source,
      fields.type,
      extracted.itemName,
      extracted.orderDate,
      extracted.expectedDeliveryDate,
      fields.returnDeadlineDays,
      fields.returnDeadlineEstimated,
      fields.intervalDays,
      fields.scheduleType,
      fields.fixedDayOfMonth,
      fields.scheduleEstimated,
      fields.amount
    )
    .run();

  return result.meta.last_row_id;
}

// email-intake.ts(이메일 포워딩)와 routes/purchases.ts의 이미지 분석 라우트가 공유하는
// "AI 추출 결과 → pending_purchases 행" 변환 로직. AI가 준 값을 그대로 믿지 않고 항상
// sanitize를 거쳐 저장한다(모델이 스키마를 벗어난 값을 줄 수 있으므로).

import { DEFAULT_RETURN_DEADLINE_DAYS, DEFAULT_INTERVAL_DAYS, DEFAULT_WARRANTY_MONTHS } from './purchase-logic';
import { isRecurringType, PURCHASE_CATEGORIES, PURCHASE_TYPES, type PurchaseCategory, type PurchaseType } from '../types';
import type { ExtractedOrder } from './order-extraction';

/** AI가 준 종류 추정값이 유효한 3종 중 하나가 아니면(모델 오류 등) 안전하게 기본값으로 되돌린다. */
export function sanitizeEstimatedType(value: string | null): PurchaseType {
  return PURCHASE_TYPES.includes(value as PurchaseType) ? (value as PurchaseType) : 'GENERAL';
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

/** yyyy-MM-dd 문자열에서 "일"만 뽑아낸다 — SUBSCRIPTION의 애매한 주기를 FIXED_DAY 기본값으로
 *  되돌릴 때 어떤 날짜든(보통 주문일) 있으면 그 일자를 고정일 추정치로 쓴다. */
export function dayOfMonthFrom(dateStr: string | null): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const day = Number(dateStr.slice(8, 10));
  return day >= 1 && day <= 31 ? day : null;
}

/** AI가 준 금액이 비정상(음수·소수 등)이면 null로 되돌린다 — 0은 실제로 무료/이벤트 배송일 수 있어 유효하게 둔다. */
export function sanitizeAmount(amount: number | null): number | null {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 ? amount : null;
}

/** 카테고리는 이제 모든 구매 유형에 적용된다 — AI가 준 값이 유효한 목록을 벗어나면(모델 오류 등) OTHER로 되돌린다. */
export function sanitizeCategory(category: string | null): PurchaseCategory {
  return PURCHASE_CATEGORIES.includes(category as PurchaseCategory) ? (category as PurchaseCategory) : 'OTHER';
}

/** AI가 GENERAL 항목을 전자제품으로 판단했을 때만 기본 보증기간(12개월)을 채운다. 그 외 null —
 *  반품기한(returnDeadlineDays)과 별개로 프리필돼서 등록 화면에서 둘 다 확인/수정할 수 있다. */
export function sanitizeWarrantyMonths(type: PurchaseType, looksLikeElectronics: boolean): number | null {
  return type === 'GENERAL' && looksLikeElectronics ? DEFAULT_WARRANTY_MONTHS : null;
}

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** AI가 준 브랜드 도메인이 프로토콜/경로 없는 순수 도메인 형태가 아니면(모델 오류 등) null로
 *  되돌린다. brand 자체가 null이면(로고를 붙일 이름이 없으므로) 도메인도 의미 없어 null 처리한다. */
export function sanitizeBrandDomain(brand: string | null, domain: string | null): string | null {
  if (!brand || typeof domain !== 'string') return null;
  const trimmed = domain.trim().toLowerCase();
  return DOMAIN_PATTERN.test(trimmed) ? trimmed : null;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** AI가 준 통화 코드가 유효한 ISO 4217 3자리 형식이 아니거나 KRW(원화 표기 케이스는 이 필드
 *  자체가 null이어야 함)면 null로 되돌린다. */
export function sanitizeCurrency(currency: string | null): string | null {
  if (typeof currency !== 'string') return null;
  const trimmed = currency.trim().toUpperCase();
  return CURRENCY_PATTERN.test(trimmed) && trimmed !== 'KRW' ? trimmed : null;
}

/** currency가 없거나 금액이 비정상(0 이하·NaN 등)이면 null로 되돌린다. */
export function sanitizeOriginalAmount(currency: string | null, amount: number | null): number | null {
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/**
 * Frankfurter(api.frankfurter.dev)에 환율 하나를 물어본다. dateStr을 생략하면(또는 그 날짜에
 * 데이터가 없어 빈 배열이 오면) 최신 환율로 폴백한다 — 이 API는 date 파라미터를 아예 생략해야
 * "최신"으로 취급하고, 예전에 여기서 쓰던 literal 문자열 "latest"를 date에 넣으면 422(invalid
 * date)로 거절당해 환율 조회 자체가 실패했었다(주문일을 못 뽑아낸 이메일마다 환산이 조용히
 * 실패하던 원인). 미래 날짜처럼 그 날짜에 데이터가 없는 경우도 200과 함께 빈 배열이 와서, 이때도
 * 최신 환율로 다시 시도한다.
 */
async function fetchKrwRate(currency: string, dateStr?: string): Promise<number | null> {
  const url = dateStr
    ? `https://api.frankfurter.dev/v2/rates?date=${dateStr}&base=${currency}&quotes=KRW`
    : `https://api.frankfurter.dev/v2/rates?base=${currency}&quotes=KRW`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json<Array<{ rate?: number }>>();
  const rate = data[0]?.rate;
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Frankfurter(ECB 공시환율 기반, 무료·API 키 불필요)로 결제일 기준 원화 환산 금액을 구한다.
 * "7달러=7원"처럼 잘못 저장하는 걸 막기 위한 핵심 로직 — 네트워크 실패·미지원 통화 등 어떤
 * 이유로든 실패하면 null을 돌려주고, 호출부가 amount=null(미확인)로 안전하게 폴백한다.
 */
export async function convertToKrw(
  currency: string,
  originalAmount: number,
  orderDate: string | null
): Promise<{ amountKrw: number; rate: number } | null> {
  try {
    const hasValidDate = orderDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(orderDate);
    const rate = (hasValidDate ? await fetchKrwRate(currency, orderDate!) : null) ?? (await fetchKrwRate(currency));
    if (rate === null) return null;
    return { amountKrw: Math.round(originalAmount * rate), rate };
  } catch {
    return null;
  }
}

export interface PendingPurchaseFields {
  type: PurchaseType;
  returnDeadlineDays: number;
  returnDeadlineEstimated: 0 | 1;
  warrantyMonths: number | null;
  intervalDays: number | null;
  scheduleType: 'INTERVAL' | 'FIXED_DAY';
  fixedDayOfMonth: number | null;
  scheduleEstimated: 0 | 1;
  amount: number | null;
  category: PurchaseCategory | null;
  brand: string | null;
  brandDomain: string | null;
  originalAmount: number | null;
  originalCurrency: string | null;
  exchangeRate: number | null;
}

/** ExtractedOrder(AI 원시 응답)를 pending_purchases에 저장할 안전한 필드로 변환한다.
 *  외화 결제(currency non-null)면 Frankfurter로 결제일 기준 환율을 조회하는 네트워크 호출이
 *  섞여 있어 async다. */
export async function buildPendingPurchaseFields(extracted: ExtractedOrder): Promise<PendingPurchaseFields> {
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

  // FIXED_DAY인데 fixedDayOfMonth가 sanitize에서 걸러졌으면(모델 오류) 일단 INTERVAL로 내려간다 —
  // 바로 아래 SUBSCRIPTION 기본값 보정에서 다시 FIXED_DAY로 바뀔 수 있다.
  let scheduleType: 'INTERVAL' | 'FIXED_DAY' = requestedScheduleType === 'FIXED_DAY' && sanitizedFixedDay === null
    ? 'INTERVAL'
    : requestedScheduleType;
  let fixedDayOfMonth = scheduleType === 'FIXED_DAY' ? sanitizedFixedDay : null;

  // INTERVAL로 확정됐는데 intervalDays가 없으면 — 원본에 주기가 전혀 없었다는 뜻이므로 30일
  // 기본 추정치로 채우고 scheduleEstimated=1로 표시한다. AI가 이미 scheduleEstimated=true를 준
  // 경우, 또는 FIXED_DAY에서 방금 폴백해온 경우도 여기서 함께 추정치 취급된다.
  let intervalDays = isRecurringType(type) && scheduleType === 'INTERVAL' ? extracted.intervalDays ?? DEFAULT_INTERVAL_DAYS : null;
  let scheduleEstimated: 0 | 1 =
    isRecurringType(type) &&
    (extracted.scheduleEstimated || (scheduleType === 'INTERVAL' && extracted.intervalDays === null))
      ? 1
      : 0;

  // Patreon과 pixivFANBOX 정기후원은 서비스 규칙으로 매월 1일 고정 결제로 관리한다.
  // 메일 본문에 다음 결제일이 빠져 있어도 일반적인 "30일 추정"이나 주문일 기반 폴백으로
  // 처리하지 않는다. 이 목록은 실제 서비스의 변하지 않는 청구 규칙을 확인한 뒤 확장한다.
  const isFirstDayMembership = [extracted.itemName, extracted.brand, extracted.brandDomain]
    .some((value) => {
      if (typeof value !== 'string') return false;
      const normalized = value.toLowerCase();
      return normalized.includes('patreon') || normalized.includes('fanbox');
    });
  if (type === 'SUBSCRIPTION' && isFirstDayMembership) {
    scheduleType = 'FIXED_DAY';
    fixedDayOfMonth = 1;
    intervalDays = null;
    scheduleEstimated = 0;
  }

  // SUBSCRIPTION 기본값 — 대부분의 정기구독은 결제일 기준 매월 특정일 고정 결제 방식을 쓴다
  // (사용자 입장에서 가장 직관적이라 실사용 사례 대다수가 이 패턴이다). 그런데 위에서 주기가
  // "모호한 추정치"(30일)로 남았다면, 프롬프트 지시만 믿지 않고 서버에서 한 번 더 FIXED_DAY로
  // 밀어준다 — 이메일에서 뽑아낸 날짜(주문일)의 "일"을 그대로 고정일로 쓴다. 프롬프트가 이 케이스를
  // 놓치더라도(모델이 매번 지시를 따르리라 보장할 수 없다) 항상 이 기본값이 적용되게 하기 위함.
  // 이메일에 쓸 만한 날짜조차 없으면(orderDate도 null) 어쩔 수 없이 기존 INTERVAL=30 추정치로 남는다.
  if (type === 'SUBSCRIPTION' && !isFirstDayMembership && scheduleType === 'INTERVAL' && scheduleEstimated === 1) {
    const fallbackDay = dayOfMonthFrom(extracted.orderDate);
    if (fallbackDay !== null) {
      scheduleType = 'FIXED_DAY';
      fixedDayOfMonth = fallbackDay;
      intervalDays = null;
      scheduleEstimated = 1;
    }
  }

  const brand = typeof extracted.brand === 'string' && extracted.brand.trim() ? extracted.brand.trim() : null;

  // 외화 결제면 AI가 준 amount는 무시(스키마상 이미 null이어야 하지만 모델 오류 방어 차원에서도)
  // 하고, 결제일(orderDate) 기준 환율로 서버가 직접 환산한다. 변환에 실패하면(네트워크 오류,
  // 미지원 통화 등) "7달러=7원"처럼 틀리게 넣느니 amount=null(미확인)로 남긴다.
  const originalCurrency = sanitizeCurrency(extracted.currency);
  const originalAmount = sanitizeOriginalAmount(originalCurrency, extracted.originalAmount);
  let amount = sanitizeAmount(extracted.amount);
  let exchangeRate: number | null = null;
  if (originalCurrency && originalAmount !== null) {
    const converted = await convertToKrw(originalCurrency, originalAmount, extracted.orderDate);
    amount = converted?.amountKrw ?? null;
    exchangeRate = converted?.rate ?? null;
  }

  return {
    type,
    returnDeadlineDays,
    returnDeadlineEstimated,
    warrantyMonths: sanitizeWarrantyMonths(type, extracted.looksLikeElectronics),
    intervalDays,
    scheduleType,
    fixedDayOfMonth,
    scheduleEstimated,
    amount,
    category: sanitizeCategory(extracted.category),
    brand,
    brandDomain: sanitizeBrandDomain(brand, extracted.brandDomain),
    originalAmount,
    originalCurrency,
    exchangeRate,
  };
}

/**
 * 이 사용자의 활성(archived 아님) 정기배송/구독 중 상품명이 같은 항목을 찾는다 — "가격 인상
 * 감지"의 기반이 되는 매칭이다. 상품명은 대소문자만 다른 표기 차이(예: "Netflix"/"netflix")를
 * 같은 항목으로 보기 위해 COLLATE NOCASE로 비교한다. 여러 개가 매칭되면(흔치 않지만) 가장 최근
 * 등록한 것을 기준으로 삼는다.
 */
async function findMatchingActivePurchase(
  db: D1Database,
  userId: number,
  type: PurchaseType,
  itemName: string
): Promise<{ id: number; amount: number | null } | null> {
  const match = await db
    .prepare(
      `SELECT id, amount FROM purchases
        WHERE user_id = ? AND type = ? AND archived_at IS NULL AND item_name = ? COLLATE NOCASE
        ORDER BY created_at DESC LIMIT 1`
    )
    .bind(userId, type, itemName)
    .first<{ id: number; amount: number | null }>();
  return match ?? null;
}

/** 삽입된 pending_purchases.id를 반환한다 — 호출부가 바로 조회해 응답에 쓸 수 있게. */
export async function insertPendingPurchase(
  db: D1Database,
  userId: number,
  source: 'email' | 'image',
  extracted: ExtractedOrder,
  isPremium: boolean
): Promise<number> {
  const fields = await buildPendingPurchaseFields(extracted);

  // 가격 인상 감지(프리미엄 전용): 같은 이름의 활성 정기배송/구독이 이미 있고, 이번에 추출한
  // 금액이 그때와 다르면 matched_purchase_id/previous_amount를 채운다 — 신규 항목이거나 금액이
  // 그대로면, 또는 무료 플랜이면 둘 다 null로 남아 그냥 확인 대기 항목으로만 동작한다.
  let matchedPurchaseId: number | null = null;
  let previousAmount: number | null = null;
  if (isPremium && isRecurringType(fields.type) && extracted.itemName && fields.amount !== null) {
    const existing = await findMatchingActivePurchase(db, userId, fields.type, extracted.itemName);
    if (existing && existing.amount !== null && existing.amount !== fields.amount) {
      matchedPurchaseId = existing.id;
      previousAmount = existing.amount;
    }
  }

  const result = await db
    .prepare(
      `INSERT INTO pending_purchases
         (user_id, source, type, item_name, order_date, expected_delivery_date, return_deadline_days, return_deadline_estimated, warranty_months, interval_days, schedule_type, fixed_day_of_month, schedule_estimated, amount, category, matched_purchase_id, previous_amount, brand, brand_domain, original_amount, original_currency, exchange_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      fields.warrantyMonths,
      fields.intervalDays,
      fields.scheduleType,
      fields.fixedDayOfMonth,
      fields.scheduleEstimated,
      fields.amount,
      fields.category,
      matchedPurchaseId,
      previousAmount,
      fields.brand,
      fields.brandDomain,
      fields.originalAmount,
      fields.originalCurrency,
      fields.exchangeRate
    )
    .run();

  return result.meta.last_row_id;
}

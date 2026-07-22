// Cloudflare Email Routing이 "Send to a Worker"로 넘겨준 메일을 처리하는 email() 핸들러 본체.
// add-{forwarding_token}@{도메인} 형태의 개인 수신 주소로 온 메일만 처리한다 — 토큰으로 어느
// 사용자의 메일인지 식별하고, Claude로 "온라인 쇼핑 주문확인 메일이 맞는지 + 상품명/일자"를
// 추출해서 pending_purchases에 확인 대기 상태로만 넣는다(바로 purchases에 등록하지 않음).
//
// 개인정보 보호: 원본 메일(제목/본문)은 파싱 직후 이 함수의 지역 변수로만 존재하다가 함수가
// 끝나면 버려진다 — DB에도, 로그에도 남기지 않는다. DB에는 Claude가 추출한 구조화 필드
// (상품명/날짜)만 저장한다.

import PostalMime from 'postal-mime';
import { extractOrderConfirmation } from './email-extract';
import { DEFAULT_RETURN_DEADLINE_DAYS } from './purchase-logic';
import { PURCHASE_TYPES, type Env, type PurchaseType, type UserRow } from '../types';

const TO_LOCAL_PART_PATTERN = /^([a-z]+)$/i;

/** AI가 준 종류 추정값이 유효한 3종 중 하나가 아니면(모델 오류 등) 안전하게 기본값으로 되돌린다. */
function sanitizeEstimatedType(value: string | null): PurchaseType {
  return PURCHASE_TYPES.includes(value as PurchaseType) ? (value as PurchaseType) : 'ONLINE_ORDER';
}

/** AI가 준 반품기한 일수가 비정상(0 이하 등)이면 안전하게 기본값으로 되돌린다. */
function sanitizeReturnDeadlineDays(days: number | null): number {
  return typeof days === 'number' && Number.isInteger(days) && days > 0 ? days : DEFAULT_RETURN_DEADLINE_DAYS;
}

function extractForwardingToken(toAddress: string): string | null {
  const localPart = toAddress.split('@')[0] ?? '';
  const match = TO_LOCAL_PART_PATTERN.exec(localPart);
  return match ? match[1].toLowerCase() : null;
}



/** postal-mime이 text 파트를 못 찾았을 때(html-only 메일) 최소한의 텍스트만 뽑아내는 폴백. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function handleIncomingEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const token = extractForwardingToken(message.to);
  if (!token) {
    console.warn(`[email-intake] 수신 주소 형식이 아니라 무시합니다: ${message.to}`);
    return;
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE forwarding_token = ?').bind(token).first<UserRow>();
  if (!user) {
    console.warn(`[email-intake] 알 수 없는 forwarding_token이라 무시합니다: ${token}`);
    return;
  }

  if (user.is_premium !== 1) {
    console.log(`[email-intake] 무료 플랜이라 처리하지 않습니다 (수신자: ${user.email})`);
    return;
  }

  const parsed = await PostalMime.parse(message.raw);
  const subject = parsed.subject ?? '(제목 없음)';
  const bodyText = parsed.text?.trim() || (parsed.html ? stripHtml(parsed.html) : '');

  if (!bodyText) {
    console.warn(`[email-intake] 본문을 읽을 수 없어 무시합니다 (수신자: ${user.email})`);
    return;
  }

  // subject/bodyText는 여기서만 쓰이고 함수 종료와 함께 버려진다 — 어디에도 저장/로그하지 않는다.
  const extracted = await extractOrderConfirmation(env.ANTHROPIC_API_KEY, subject, bodyText);
  if (!extracted || !extracted.isOrderConfirmation) {
    console.log(`[email-intake] 주문확인 메일이 아니라고 판단되어 무시합니다 (수신자: ${user.email})`);
    return;
  }

  const type = sanitizeEstimatedType(extracted.estimatedType);
  // 메일에 반품기한이 구체적으로 명시되지 않았으면 전자상거래법 최소 기준(7일)으로 채우고
  // return_deadline_estimated=1로 표시해서 확인 대기 화면에서 "추정값" 경고를 보여줄 수 있게 한다.
  const returnDeadlineDays = extracted.foundExplicitDeadline
    ? sanitizeReturnDeadlineDays(extracted.returnDeadlineDays)
    : DEFAULT_RETURN_DEADLINE_DAYS;
  const returnDeadlineEstimated = extracted.foundExplicitDeadline ? 0 : 1;

  const intervalDays = type === 'RECURRING_DELIVERY' ? (extracted.intervalDays ?? null) : null;

  await env.DB.prepare(
    `INSERT INTO pending_purchases
       (user_id, source, type, item_name, order_date, expected_delivery_date, return_deadline_days, return_deadline_estimated, interval_days)
     VALUES (?, 'email', ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(user.id, type, extracted.itemName, extracted.orderDate, extracted.expectedDeliveryDate, returnDeadlineDays, returnDeadlineEstimated, intervalDays)
    .run();

  console.log(`[email-intake] 확인 대기 항목 추가 (수신자: ${user.email}, 상품명: ${extracted.itemName ?? '(없음)'})`);
}

// Cloudflare Email Routing이 "Send to a Worker"로 넘겨준 메일을 처리하는 email() 핸들러 본체.
// add-{forwarding_token}@{도메인} 형태의 개인 수신 주소로 온 메일만 처리한다 — 토큰으로 어느
// 사용자의 메일인지 식별하고, Claude로 "온라인 쇼핑 주문확인 메일이 맞는지 + 상품명/일자"를
// 추출해서 pending_purchases에 확인 대기 상태로만 넣는다(바로 purchases에 등록하지 않음).

import PostalMime from 'postal-mime';
import { extractOrderConfirmation } from './email-extract';
import type { Env, UserRow } from '../types';

const TO_LOCAL_PART_PATTERN = /^add-([a-z0-9]+)$/i;
// 사용자가 대시보드에서 "이게 무슨 메일이었지"를 확인할 수 있게 남기는 정도의 짧은 발췌.
const RAW_EXCERPT_MAX_CHARS = 300;

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

  const parsed = await PostalMime.parse(message.raw);
  const subject = parsed.subject ?? '(제목 없음)';
  const bodyText = parsed.text?.trim() || (parsed.html ? stripHtml(parsed.html) : '');

  if (!bodyText) {
    console.warn(`[email-intake] 본문을 읽을 수 없어 무시합니다 (수신자: ${user.email}, 제목: ${subject})`);
    return;
  }

  const extracted = await extractOrderConfirmation(env.ANTHROPIC_API_KEY, subject, bodyText);
  if (!extracted || !extracted.isOrderConfirmation) {
    console.log(`[email-intake] 주문확인 메일이 아니라고 판단되어 무시합니다 (수신자: ${user.email}, 제목: ${subject})`);
    return;
  }

  const rawExcerpt = `${subject}\n\n${bodyText}`.slice(0, RAW_EXCERPT_MAX_CHARS);

  await env.DB.prepare(
    `INSERT INTO pending_purchases
       (user_id, source, item_name, order_date, return_deadline, expected_delivery_date, raw_excerpt)
     VALUES (?, 'email', ?, ?, ?, ?, ?)`
  )
    .bind(user.id, extracted.itemName, extracted.orderDate, extracted.returnDeadline, extracted.expectedDeliveryDate, rawExcerpt)
    .run();

  console.log(`[email-intake] 확인 대기 항목 추가 (수신자: ${user.email}, 상품명: ${extracted.itemName ?? '(없음)'})`);
}

// Cloudflare Email Routing이 "Send to a Worker"로 넘겨준 메일을 처리하는 email() 핸들러 본체.
// {forwarding_token}@{도메인} 형태의 개인 수신 주소로 온 메일만 처리한다 — 토큰으로 어느
// 사용자의 메일인지 식별하고, Claude로 "온라인 쇼핑 주문확인 메일이 맞는지 + 상품명/일자"를
// 추출해서 pending_purchases에 확인 대기 상태로만 넣는다(바로 purchases에 등록하지 않음).
//
// 개인정보 보호: 원본 메일(제목/본문)은 파싱 직후 이 함수의 지역 변수로만 존재하다가 함수가
// 끝나면 버려진다 — DB에도, 로그에도 남기지 않는다. DB에는 Claude가 추출한 구조화 필드
// (상품명/날짜)만 저장한다.

import PostalMime from 'postal-mime';
import { extractOrderConfirmation } from './email-extract';
import { insertPendingPurchase } from './pending-purchase-intake';
import { buildExtractionFailedEmailHtml, sendDigestEmail } from './email';
import type { FxCardBrand, FxCardIssuer } from './fx-card';
import type { Env, UserRow } from '../types';
import { logger, maskEmail } from './logger';

// 신규 토큰은 영문 소문자지만, 기존 계정에는 마이그레이션에서 발급한 16진수 토큰이
// 남아 있을 수 있다. 숫자를 막으면 그 계정의 정상 수신 주소를 조용히 버리게 된다.
const TO_LOCAL_PART_PATTERN = /^([a-z0-9]+)$/i;
const FREE_PLAN_MONTHLY_EMAIL_LIMIT = 10;

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
    logger.warn('email.intake.invalid_recipient');
    return;
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE forwarding_token = ?').bind(token).first<UserRow>();
  if (!user) {
    logger.warn('email.intake.unknown_recipient');
    return;
  }

  // 실제 등록 개수 제한은 확인(POST /purchases) 시점에 FREE_PLAN_MAX_PURCHASES로도 걸리지만,
  // AI 토큰 비용 절감을 위해 무료 플랜은 이메일 처리 자체를 월 FREE_PLAN_MONTHLY_EMAIL_LIMIT건으로 제한한다.
  if (user.is_premium === 0) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (user.free_email_month === currentMonth && user.free_email_count >= FREE_PLAN_MONTHLY_EMAIL_LIMIT) {
      logger.info('email.intake.free_limit_exceeded', { recipient: maskEmail(user.email) });
      return;
    }
    if (user.free_email_month === currentMonth) {
      await env.DB.prepare('UPDATE users SET free_email_count = free_email_count + 1 WHERE id = ?')
        .bind(user.id).run();
    } else {
      await env.DB.prepare('UPDATE users SET free_email_month = ?, free_email_count = 1 WHERE id = ?')
        .bind(currentMonth, user.id).run();
    }
  }

  const parsed = await PostalMime.parse(message.raw);
  const subject = parsed.subject ?? '(제목 없음)';
  const bodyText = parsed.text?.trim() || (parsed.html ? stripHtml(parsed.html) : '');

  if (!bodyText) {
    logger.warn('email.intake.empty_body', { recipient: maskEmail(user.email) });
    return;
  }

  // subject/bodyText는 여기서만 쓰이고 함수 종료와 함께 버려진다 — 어디에도 저장/로그하지 않는다.
  const extracted = await extractOrderConfirmation(env.ANTHROPIC_API_KEY, subject, bodyText);
  if (!extracted) {
    // API 오류(null) — 주문 메일임에도 처리 못 했을 수 있으니 사용자에게 알린다.
    logger.warn('email.intake.extraction_api_error', { recipient: maskEmail(user.email) });
    const html = buildExtractionFailedEmailHtml(user.nickname, `${env.APP_URL}/dashboard`);
    await sendDigestEmail(env.RESEND_API_KEY, user.email, '포워딩된 메일을 읽지 못했어요 — Remindue', html);
    return;
  }
  if (!extracted.isOrderConfirmation) {
    // 주문확인 메일이 아님 — 광고/뉴스레터 등 정상 필터링이므로 조용히 무시한다.
    logger.info('email.intake.not_order_confirmation', { recipient: maskEmail(user.email) });
    return;
  }

  await insertPendingPurchase(
    env.DB,
    user.id,
    'email',
    extracted,
    user.is_premium === 1,
    user.fx_card_issuer as FxCardIssuer | null,
    user.fx_card_brand as FxCardBrand | null,
    env.KOREA_EXIM_API_KEY
  );

  logger.info('email.intake.pending_created', { recipient: maskEmail(user.email), hasItemName: Boolean(extracted.itemName) });
}

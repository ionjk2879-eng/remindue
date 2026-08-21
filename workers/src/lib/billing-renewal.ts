// 정기결제(월/연) 자동 갱신 크론 — 토스 빌링키는 토스가 알아서 주기 청구를 해주지 않으므로,
// 만료가 임박한 구독을 찾아 서버가 직접 매번 청구를 건다. index.ts의 scheduled()가 기존 일일
// 크론(daily digest와 같은 트리거)에 얹어서 매일 호출한다.
//
// 실패는 연속 3회(threshold)까지는 다음 날 같은 구독이 다시 조건에 걸려 자연스럽게 재시도되고,
// 3회를 넘기면 auto_renew를 꺼서 더 이상 청구를 시도하지 않는다 — 이후 premium_expires_at이
// 지나면 runPremiumExpirySweep이 프리미엄을 내린다.

import { chargeBillingKey, TossApiError } from './toss';
import { chargeSubscription, KakaoPayApiError } from './kakaopay';
import { KAKAO_CHARGE_ITEM_NAME, PLAN_CONFIG, PLAN_LABEL } from './billing-plans';
import { buildRenewalFailedEmailHtml, sendDigestEmail } from './email';
import type { Env, SubscriptionRow } from '../types';

const RENEWAL_WINDOW = "+1 day"; // 만료 하루 전부터 갱신 대상으로 본다 — 만료 순간 공백 없이 이어지도록.
const MAX_CONSECUTIVE_FAILURES = 3;

interface DueSubscription extends SubscriptionRow {
  user_email: string;
  user_nickname: string;
  user_email_notifications_enabled: number;
  user_toss_customer_key: string | null;
}

export interface BillingRenewalRunResult {
  attempted: number;
  renewed: number;
  failed: number;
  downgraded: number;
}

export async function runBillingRenewals(env: Env): Promise<BillingRenewalRunResult> {
  const { results } = await env.DB.prepare(
    `SELECT s.*, u.email AS user_email, u.nickname AS user_nickname,
            u.email_notifications_enabled AS user_email_notifications_enabled,
            u.toss_customer_key AS user_toss_customer_key
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
      WHERE s.status = 'ACTIVE' AND s.auto_renew = 1
        AND s.current_period_end <= datetime('now', ?)`
  )
    .bind(RENEWAL_WINDOW)
    .all<DueSubscription>();

  let renewed = 0;
  let failed = 0;
  let downgraded = 0;
  const dashboardUrl = `${env.APP_URL}/dashboard`;

  for (const sub of results) {
    // 장기 정기결제는 더 이상 갱신하지 않고 현재 이용 기간 만료 후 종료한다.
    if (sub.plan === 'ANNUAL') {
      await env.DB.prepare(
        `UPDATE subscriptions SET status = 'CANCELED', auto_renew = 0, updated_at = datetime('now') WHERE id = ?`
      ).bind(sub.id).run();
      downgraded += 1;
      continue;
    }

    const isKakao = !!sub.kakao_sid;
    if (!isKakao && (!sub.toss_billing_key || !sub.user_toss_customer_key)) {
      // 데이터 정합성이 깨진 행(빌링키 없이 auto_renew=1) — 청구를 시도할 수 없으니 건너뛴다.
      console.error(`[billing-renewal] 구독 ${sub.id}에 빌링키/고객키가 없어 건너뜁니다`);
      continue;
    }

    const config = PLAN_CONFIG[sub.plan];

    // Worker 크래시(청구 성공 후 DB 업데이트 전)나 크론 중복 실행으로 인한 이중 청구 방지 —
    // current_period_end 3일 전 이후에 CONFIRMED된 결제가 이미 있으면 이번 주기는 건너뛴다.
    const alreadyCharged = await env.DB.prepare(
      `SELECT 1 FROM payments
       WHERE subscription_id = ? AND status = 'CONFIRMED'
         AND confirmed_at >= datetime(?, '-3 days')`
    ).bind(sub.id, sub.current_period_end).first();
    if (alreadyCharged) {
      console.log(`[billing-renewal] 구독 ${sub.id}: 이번 주기 이미 청구됨, 건너뜁니다`);
      continue;
    }

    const orderId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO payments (user_id, subscription_id, order_id, plan, amount, status, pg_provider) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`
    )
      .bind(sub.user_id, sub.id, orderId, sub.plan, config.amount, isKakao ? 'KAKAOPAY' : 'TOSS')
      .run();

    try {
      const paymentKey = isKakao
        ? (
            await chargeSubscription(env.KAKAOPAY_SECRET_KEY, {
              cid: env.KAKAOPAY_SUBSCRIPTION_CID,
              sid: sub.kakao_sid!,
              partnerOrderId: orderId,
              partnerUserId: String(sub.user_id),
              // 한글 item_name은 카카오페이 청구 API가 거부한다(등록 API는 괜찮음) — 영문 전용으로 쓴다.
              itemName: KAKAO_CHARGE_ITEM_NAME[sub.plan],
              quantity: 1,
              totalAmount: config.amount,
              taxFreeAmount: 0,
            })
          ).tid
        : (
            await chargeBillingKey(env.TOSS_SECRET_KEY, sub.toss_billing_key!, {
              customerKey: sub.user_toss_customer_key!,
              amount: config.amount,
              orderId,
              orderName: config.orderName,
            })
          ).paymentKey;

      await env.DB.prepare(
        `UPDATE payments SET status = 'CONFIRMED', payment_key = ?, confirmed_at = datetime('now') WHERE order_id = ?`
      )
        .bind(paymentKey, orderId)
        .run();

      // 실제 결제일이 아니라 "원래 스케줄이었던" current_period_end 기준으로 다음 주기를 더한다 —
      // 크론이 하루 늦게 돌았다고 다음 만료일까지 밀리지 않게(정기배송 스케줄 계산과 같은 이유).
      await env.DB.prepare(
        `UPDATE subscriptions
            SET current_period_end = datetime(current_period_end, ?), failed_charge_count = 0, updated_at = datetime('now')
          WHERE id = ?`
      )
        .bind(config.periodModifier, sub.id)
        .run();

      const newPeriodEnd = await env.DB.prepare('SELECT current_period_end FROM subscriptions WHERE id = ?')
        .bind(sub.id)
        .first<{ current_period_end: string }>();

      await env.DB.prepare('UPDATE users SET premium_expires_at = ?, is_premium = 1 WHERE id = ?')
        .bind(newPeriodEnd!.current_period_end, sub.user_id)
        .run();

      renewed += 1;
    } catch (err) {
      const reason = isKakao
        ? (err instanceof KakaoPayApiError ? err.message : '자동 결제에 실패했습니다')
        : (err instanceof TossApiError ? err.message : '자동 결제에 실패했습니다');
      await env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE order_id = ?`)
        .bind(reason, orderId)
        .run();

      const newFailedCount = sub.failed_charge_count + 1;
      const willDowngrade = newFailedCount >= MAX_CONSECUTIVE_FAILURES;

      await env.DB.prepare(
        `UPDATE subscriptions SET failed_charge_count = ?, status = ?, auto_renew = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(newFailedCount, willDowngrade ? 'PAST_DUE' : 'ACTIVE', willDowngrade ? 0 : 1, sub.id)
        .run();

      if (sub.user_email_notifications_enabled === 1) {
        const html = buildRenewalFailedEmailHtml(sub.user_nickname, PLAN_LABEL[sub.plan], !willDowngrade, dashboardUrl);
        const subject = willDowngrade ? '정기결제가 해지됐어요 — Remindue' : '정기결제 자동 갱신에 실패했어요 — Remindue';
        await sendDigestEmail(env.RESEND_API_KEY, sub.user_email, subject, html);
      }

      failed += 1;
      if (willDowngrade) downgraded += 1;
    }
  }

  return { attempted: results.length, renewed, failed, downgraded };
}

/**
 * 만료된 프리미엄을 내린다. auto_renew=1인 ACTIVE 구독이 남아있는 사용자는 제외한다 —
 * 결제가 1~2회 연속 실패해서 아직 재시도 유예 기간(MAX_CONSECUTIVE_FAILURES에 도달하기
 * 전) 중이면 current_period_end/premium_expires_at이 이미 지났어도 곧바로 내리지 않고
 * runBillingRenewals가 재시도할 기회를 준다. 3회를 넘겨 auto_renew가 꺼지고 나서야
 * (또는 애초에 ONE_TIME 만료라면 바로) 이 스윕이 실제로 내린다.
 */
export async function runPremiumExpirySweep(env: Env): Promise<{ demoted: number }> {
  const result = await env.DB.prepare(
    `UPDATE users
        SET is_premium = 0
      WHERE is_premium = 1
        AND premium_expires_at IS NOT NULL
        AND premium_expires_at < datetime('now')
        AND id NOT IN (SELECT user_id FROM subscriptions WHERE status = 'ACTIVE' AND auto_renew = 1)`
  ).run();

  return { demoted: result.meta.changes ?? 0 };
}

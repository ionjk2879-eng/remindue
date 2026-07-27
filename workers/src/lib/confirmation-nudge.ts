// "확인이 필요한 항목" 알림 — 결제/배송 하나의 주기 안에서 3단계로 진행된다:
//
//   1) 당일 유지 확인(sameDay, dDay===0): 액션 버튼("유지하기"/"나중에")이 붙은 개별 알림 —
//      과거 이력과 무관하게 매번. 버튼 하나가 정확히 그 항목 하나만 가리켜야 해서 다른 항목과
//      묶지 않고 항목별로 따로 보낸다. "오늘 배송/결제됩니다" 같은 사실 통보 톤은 일부러 안 쓴다
//      — 택배사·판매처·카드사가 이미 그런 알림을 보내줘서 중복이다. 대신 "계속 유지하시겠어요?"
//      처럼 관리(유지 여부) 자체에 집중한 문구로 둔다.
//   2) 완료 확인(followUp): 직전 회차가 하루 지났는데도 이번 회차를 확인 안 한 항목만
//      (missedRounds>=1) — "아직 확인 안 하셨어요."
//   3) 절약 검토 대상(reviewFlagged): 직전 회차가 일주일 지났는데도 여전히 확인 안 한
//      항목만 — "AI가 절약 검토 대상으로 표시했다"는 확정 톤.
//
// 2)/3)은 유저당 한 통으로 묶어서 보낸다. 매일 도는 크론
// (index.ts)에서 매번 실행한다 — dDay가 딱 맞아떨어지는 순간을 놓치지 않으려면 요일 조건 없이
// 매일 체크해야 한다(주 1회만 체크하면 그 요일에 안 걸리는 항목은 영영 못 잡는다).
//
// missedRounds 계산(회차 수 vs delivery_confirm_count 비교)은 purchase-logic.ts에서 예전에
// "놓친 배송" 오탐으로 제거된 computeMissedConfirmations와 계산식이 비슷하다 — 그러나 여기서는
// "배송이 안 됐다"를 단정하지 않고 "확인해달라"는 참고용 알림일 뿐이다. discontinued_at으로
// 명시하지 않는 한 "사용 안 함"이라 단정하지 않는다(DashboardPage.tsx의 missedRoundsFor와 동일한
// 원칙 — 그쪽은 프론트 표시용, 이건 서버 알림 발송용으로 같은 계산을 그대로 복제해서 쓴다).

import { computeDDay, computeDeadline, computePreviousScheduleDeadline } from './purchase-logic';
import { buildConfirmationNudgeEmailHtml, sendDigestEmail } from './email';
import { sendPush } from './push';
import { createActionBatchToken } from './action-tokens';
import { effectiveNotificationDays } from './notification-prefs';
import type { Env, PurchaseRow, PushSubscriptionRow } from '../types';

/** 유지 여부는 비용이 발생하기 전날에 먼저 묻고, 미응답이면 당일 한 번만 재알림한다. */
const RENEWAL_DAY_DDAY = 0;

interface RecurringPurchaseWithUser extends PurchaseRow {
  user_email: string;
  user_nickname: string;
  user_email_notifications_enabled: number;
  user_is_premium: number;
  user_renewal_notification_days: string;
}

/** DashboardPage.tsx의 missedRoundsFor와 동일한 계산 — 서버에는 그 함수가 없어 여기서 복제한다. */
function missedRoundsFor(deliveryRound: number | null, deliveryConfirmCount: number, dDay: number): number {
  if (deliveryRound === null) return 0;
  const confirmableRounds = dDay <= 0 ? deliveryRound : deliveryRound - 1;
  return Math.max(0, confirmableRounds - deliveryConfirmCount);
}

interface UserNudgeBucket {
  email: string;
  nickname: string;
  emailEnabled: boolean;
  /** 완료 확인 대상(dDay===-1, 미확인) 항목명. */
  followUp: string[];
  /** 절약 검토 대상(dDay===-7, 여전히 미확인) 항목명. */
  reviewFlagged: string[];
}

interface SameDayConfirmItem {
  id: number;
  itemName: string;
}

export interface ConfirmationNudgeRunResult {
  usersNotified: number;
  emailsSent: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

/** 같은 날 확인할 항목을 한 알림으로 묶고, 대시보드에서 유지할 항목을 고르게 한다. */
async function sendSameDayConfirmPush(
  env: Env,
  userId: number,
  items: SameDayConfirmItem[]
): Promise<{ pushSent: number; pushSubscriptionsPruned: number }> {
  const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .bind(userId)
    .all<PushSubscriptionRow>();
  if (subs.length === 0) return { pushSent: 0, pushSubscriptionsPruned: 0 };

  const actionToken = await createActionBatchToken(env.DB, userId, 'RECURRING', items.map((item) => item.id));
  const dashboardUrl = `${env.APP_URL}/dashboard?confirmRecurringBatch=${actionToken}&confirmRecurring=${items.map((item) => item.id).join(',')}`;
  const itemSummary = items.slice(0, 2).map((item) => item.itemName).join(', ');
  const more = items.length > 2 ? ` 외 ${items.length - 2}건` : '';

  let pushSent = 0;
  let pushSubscriptionsPruned = 0;
  for (const sub of subs) {
    const { sent, gone } = await sendPush(env, sub, {
      title: `🔔 다음 회차 유지 확인 ${items.length}건`,
      body: `${itemSummary}${more} — 다음 배송·결제를 계속 진행할지 선택해 주세요.`,
      url: dashboardUrl,
      notificationKind: 'RENEWAL',
      actions: [
        { action: 'recurring_all_maintain', title: '모두 유지' },
        { action: 'recurring_partial', title: '일부 유지' },
        { action: 'recurring_all_discontinue', title: '모두 중단' },
      ],
      actionToken,
    });
    if (sent) pushSent += 1;
    if (gone) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
      pushSubscriptionsPruned += 1;
    }
  }
  return { pushSent, pushSubscriptionsPruned };
}

export async function runConfirmationNudge(env: Env): Promise<ConfirmationNudgeRunResult> {
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.email AS user_email, u.nickname AS user_nickname,
            u.email_notifications_enabled AS user_email_notifications_enabled,
            u.is_premium AS user_is_premium, u.renewal_notification_days AS user_renewal_notification_days
       FROM purchases p
       JOIN users u ON u.id = p.user_id
      WHERE p.type IN ('RECURRING_DELIVERY', 'SUBSCRIPTION')
        AND p.is_one_time = 0
        AND p.archived_at IS NULL
        AND p.discarded_at IS NULL
        AND p.discontinued_at IS NULL`
  ).all<RecurringPurchaseWithUser>();

  const bucketsByUserId = new Map<number, UserNudgeBucket>();
  const sameDayItemsByUserId = new Map<number, SameDayConfirmItem[]>();
  let emailsSent = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  for (const row of results) {
    const { deadline, deliveryRound } = computeDeadline(row);
    const dDay = computeDDay(deadline);

    const missedRounds = missedRoundsFor(deliveryRound, row.delivery_confirm_count, dDay);
    // 무료는 당일 한 번만 안내한다. 프리미엄은 전날에 먼저 묻고, 미응답일 때만 당일 재알림한다.
    const renewalDays = row.user_is_premium === 1
      ? effectiveNotificationDays(true, row.user_renewal_notification_days)
      : [RENEWAL_DAY_DDAY];
    const shouldAskForRenewal = renewalDays.includes(dDay) && row.renewal_decision_for !== deadline;
    if (shouldAskForRenewal) {
      const items = sameDayItemsByUserId.get(row.user_id) ?? [];
      items.push({ id: row.id, itemName: row.item_name });
      sameDayItemsByUserId.set(row.user_id, items);
      continue;
    }

    // 다음 일정은 자동으로 미래 회차로 넘어가므로, 직전 회차의 날짜로 다음 날/일주일 뒤를 판정한다.
    const previousDeadline = computePreviousScheduleDeadline(row);
    if (previousDeadline === null) continue;
    const daysSincePreviousDeadline = computeDDay(previousDeadline);
    if (daysSincePreviousDeadline !== -7 || row.renewal_decision_for === previousDeadline) continue;
    if (missedRounds < 1) continue;

    const bucket = bucketsByUserId.get(row.user_id) ?? {
      email: row.user_email,
      nickname: row.user_nickname,
      emailEnabled: row.user_email_notifications_enabled === 1,
      followUp: [],
      reviewFlagged: [],
    };
    bucket.reviewFlagged.push(row.item_name);
    bucketsByUserId.set(row.user_id, bucket);
  }

  for (const [userId, items] of sameDayItemsByUserId) {
    const result = await sendSameDayConfirmPush(env, userId, items);
    pushSent += result.pushSent;
    pushSubscriptionsPruned += result.pushSubscriptionsPruned;
  }

  const dashboardUrl = `${env.APP_URL}/dashboard`;
  const subject = '아직 이용 중인지 확인이 필요해요 — Remindue';

  for (const [userId, { email, nickname, emailEnabled, followUp, reviewFlagged }] of bucketsByUserId) {
    if (emailEnabled) {
      const html = buildConfirmationNudgeEmailHtml(nickname, [], followUp, reviewFlagged, dashboardUrl);
      const { sent } = await sendDigestEmail(env.RESEND_API_KEY, email, subject, html);
      if (sent) emailsSent += 1;
    }

    const parts: string[] = [];
    if (followUp.length > 0) parts.push(`${followUp.length}건 확인 필요`);
    if (reviewFlagged.length > 0) parts.push(`${reviewFlagged.length}건 절약 검토 대상`);
    const pushBody = parts.join(' · ');

    const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .bind(userId)
      .all<PushSubscriptionRow>();

    for (const sub of subs) {
      const { sent, gone } = await sendPush(env, sub, { title: subject, body: pushBody, url: dashboardUrl });
      if (sent) pushSent += 1;
      if (gone) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        pushSubscriptionsPruned += 1;
      }
    }
  }

  return { usersNotified: bucketsByUserId.size, emailsSent, pushSent, pushSubscriptionsPruned };
}

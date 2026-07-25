// "확인이 필요한 항목" 알림 — 결제/배송 하나의 주기 안에서 4단계로 진행된다:
//
//   1) 예고(advance, dDay===effectiveConfirmationAdvanceDays): 과거 이력과 무관하게 매번
//      (정기구독·배송 둘 다) — 무료는 3일 전 고정, 프리미엄만 settings에서 바꿀 수 있다
//      (notification-prefs.ts). 문구는 일부러 "N일 후 배송됩니다" 같은 날짜·사실 통보를 안 쓴다
//      — 그건 D-day 다이제스트(digest.ts)의 역할이라 겹치고, 정기배송 일정은 우리가 계산한
//      추정치라 실제 배송일과 다를 수 있어 단정하면 위험하다. 대신 "곧 일정이 있으니 계속
//      이용 중이면 미리 확인해달라"는 확인 행동 요청에만 집중한다(buildConfirmationNudgeEmailHtml).
//   2) 당일 유지 확인(sameDay, dDay===0): 액션 버튼("유지하기"/"나중에")이 붙은 개별 알림 —
//      과거 이력과 무관하게 매번. 버튼 하나가 정확히 그 항목 하나만 가리켜야 해서 다른 항목과
//      묶지 않고 항목별로 따로 보낸다. "오늘 배송/결제됩니다" 같은 사실 통보 톤은 일부러 안 쓴다
//      — 택배사·판매처·카드사가 이미 그런 알림을 보내줘서 중복이다. 대신 "계속 유지하시겠어요?"
//      처럼 관리(유지 여부) 자체에 집중한 문구로 둔다.
//   3) 완료 확인(followUp, dDay===-1): 예정일이 하루 지났는데도 이번 회차를 확인 안 한 항목만
//      (missedRounds>=1) — "아직 확인 안 하셨어요."
//   4) 절약 검토 대상(reviewFlagged, dDay===-7): 예정일이 일주일 지났는데도 여전히 확인 안 한
//      항목만 — "AI가 절약 검토 대상으로 표시했다"는 확정 톤.
//
// 3)/4)는 유저당 한 통으로 묶어서 보낸다(1은 대상이 많아 마찬가지로 배치). 매일 도는 크론
// (index.ts)에서 매번 실행한다 — dDay가 딱 맞아떨어지는 순간을 놓치지 않으려면 요일 조건 없이
// 매일 체크해야 한다(주 1회만 체크하면 그 요일에 안 걸리는 항목은 영영 못 잡는다).
//
// missedRounds 계산(회차 수 vs delivery_confirm_count 비교)은 purchase-logic.ts에서 예전에
// "놓친 배송" 오탐으로 제거된 computeMissedConfirmations와 계산식이 비슷하다 — 그러나 여기서는
// "배송이 안 됐다"를 단정하지 않고 "확인해달라"는 참고용 알림일 뿐이다. discontinued_at으로
// 명시하지 않는 한 "사용 안 함"이라 단정하지 않는다(DashboardPage.tsx의 missedRoundsFor와 동일한
// 원칙 — 그쪽은 프론트 표시용, 이건 서버 알림 발송용으로 같은 계산을 그대로 복제해서 쓴다).

import { computeDDay, computeDeadline } from './purchase-logic';
import { effectiveConfirmationAdvanceDays } from './notification-prefs';
import { buildConfirmationNudgeEmailHtml, sendDigestEmail } from './email';
import { sendPush } from './push';
import { createActionToken } from './action-tokens';
import type { Env, PurchaseRow, PurchaseType, PushSubscriptionRow } from '../types';

/** 당일 유지 확인(액션 버튼) 알림: 결제/배송 당일. */
const SAME_DAY_DDAY = 0;
/** 완료 확인 알림: 예정일이 하루 지났는데도 미확인일 때. */
const FOLLOWUP_DDAY = -1;
/** 절약 검토 대상 알림: 예정일이 일주일 지났는데도 여전히 미확인일 때. */
const WEEK_FOLLOWUP_DDAY = -7;

interface RecurringPurchaseWithUser extends PurchaseRow {
  user_email: string;
  user_nickname: string;
  user_email_notifications_enabled: number;
  user_is_premium: number;
  user_confirmation_advance_days: number;
}

/** DashboardPage.tsx의 missedRoundsFor와 동일한 계산 — 서버에는 그 함수가 없어 여기서 복제한다. */
function missedRoundsFor(deliveryRound: number | null, deliveryConfirmCount: number, dDay: number): number {
  if (deliveryRound === null) return 0;
  const confirmableRounds = dDay <= 0 ? deliveryRound : deliveryRound - 1;
  return Math.max(0, confirmableRounds - deliveryConfirmCount);
}

export interface AdvanceItem {
  itemName: string;
  type: PurchaseType;
  advanceDays: number;
}

interface UserNudgeBucket {
  email: string;
  nickname: string;
  emailEnabled: boolean;
  /** 예고 대상 항목 — 결제/배송 문구를 종류별로 다르게 쓰려고 type도 같이 들고 다닌다. */
  advance: AdvanceItem[];
  /** 완료 확인 대상(dDay===-1, 미확인) 항목명. */
  followUp: string[];
  /** 절약 검토 대상(dDay===-7, 여전히 미확인) 항목명. */
  reviewFlagged: string[];
}

export interface ConfirmationNudgeRunResult {
  usersNotified: number;
  emailsSent: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

/** 당일(dDay===0) 항목 하나에 액션 버튼("유지하기"/"나중에")이 붙은 개별 알림을 보낸다 —
 *  "오늘 왔다/결제됐다"는 사실 통보가 아니라 "계속 유지할지" 관리에 초점을 맞춘 문구. */
async function sendSameDayConfirmPush(
  env: Env,
  row: RecurringPurchaseWithUser
): Promise<{ pushSent: number; pushSubscriptionsPruned: number }> {
  const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .bind(row.user_id)
    .all<PushSubscriptionRow>();
  if (subs.length === 0) return { pushSent: 0, pushSubscriptionsPruned: 0 };

  const actionToken = await createActionToken(env.DB, row.id);
  const dashboardUrl = `${env.APP_URL}/dashboard`;

  let pushSent = 0;
  let pushSubscriptionsPruned = 0;
  for (const sub of subs) {
    const { sent, gone } = await sendPush(env, sub, {
      title: `🔔 ${row.item_name}, 계속 유지하시겠어요?`,
      body: '"유지하기"를 눌러 이번 회차를 확인해 주세요.',
      url: dashboardUrl,
      actions: [
        { action: 'confirm', title: '유지하기' },
        { action: 'later', title: '나중에' },
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
            u.is_premium AS user_is_premium,
            u.confirmation_advance_days AS user_confirmation_advance_days
       FROM purchases p
       JOIN users u ON u.id = p.user_id
      WHERE p.type IN ('RECURRING_DELIVERY', 'SUBSCRIPTION')
        AND p.archived_at IS NULL
        AND p.discarded_at IS NULL
        AND p.discontinued_at IS NULL`
  ).all<RecurringPurchaseWithUser>();

  const bucketsByUserId = new Map<number, UserNudgeBucket>();
  let emailsSent = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  for (const row of results) {
    const { deadline, deliveryRound } = computeDeadline(row);
    const dDay = computeDDay(deadline);

    // (2) 당일 유지 확인 — 정기구독·배송 둘 다, 과거 이력과 무관하게 매번. 배치 대상이 아니니
    // 즉시 개별 발송하고 다음 항목으로 넘어간다.
    if (dDay === SAME_DAY_DDAY) {
      const result = await sendSameDayConfirmPush(env, row);
      pushSent += result.pushSent;
      pushSubscriptionsPruned += result.pushSubscriptionsPruned;
      continue;
    }

    // (1) 예고 — 과거 이력과 무관하게 매번. 무료는 3일 고정, 프리미엄은 사용자 설정값.
    const advanceDays = effectiveConfirmationAdvanceDays(row.user_is_premium === 1, row.user_confirmation_advance_days);
    if (dDay === advanceDays) {
      const bucket = bucketsByUserId.get(row.user_id) ?? {
        email: row.user_email,
        nickname: row.user_nickname,
        emailEnabled: row.user_email_notifications_enabled === 1,
        advance: [],
        followUp: [],
        reviewFlagged: [],
      };
      bucket.advance.push({ itemName: row.item_name, type: row.type, advanceDays });
      bucketsByUserId.set(row.user_id, bucket);
      continue;
    }

    // (3)/(4) 완료 확인 / 절약 검토 대상 — 이번 회차가 아직 미확인일 때만.
    if (dDay !== FOLLOWUP_DDAY && dDay !== WEEK_FOLLOWUP_DDAY) continue;
    const missedRounds = missedRoundsFor(deliveryRound, row.delivery_confirm_count, dDay);
    if (missedRounds < 1) continue;

    const bucket = bucketsByUserId.get(row.user_id) ?? {
      email: row.user_email,
      nickname: row.user_nickname,
      emailEnabled: row.user_email_notifications_enabled === 1,
      advance: [],
      followUp: [],
      reviewFlagged: [],
    };
    if (dDay === FOLLOWUP_DDAY) {
      bucket.followUp.push(row.item_name);
    } else {
      bucket.reviewFlagged.push(row.item_name);
    }
    bucketsByUserId.set(row.user_id, bucket);
  }

  const dashboardUrl = `${env.APP_URL}/dashboard`;
  const subject = '아직 이용 중인지 확인이 필요해요 — Remindue';

  for (const [userId, { email, nickname, emailEnabled, advance, followUp, reviewFlagged }] of bucketsByUserId) {
    if (emailEnabled) {
      const html = buildConfirmationNudgeEmailHtml(nickname, advance, followUp, reviewFlagged, dashboardUrl);
      const { sent } = await sendDigestEmail(env.RESEND_API_KEY, email, subject, html);
      if (sent) emailsSent += 1;
    }

    const parts: string[] = [];
    if (advance.length > 0) parts.push(`${advance.length}건 곧 결제/배송 예정`);
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

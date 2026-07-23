// 정기배송(RECURRING_DELIVERY) 전용 주간 리포트 — D-day 다이제스트(digest.ts)와 별개로
// 매주 한 번(월요일, index.ts의 scheduled 핸들러가 요일을 확인해서 호출)만 실행된다.
// 프리미엄 알림 기능이라 users.is_premium=1인 사용자에게만 보낸다.
//
// 이번 주(오늘부터 7일 이내) 배송 예정인 항목만 모아서 보여준다. ("확인을 놓친 배송" 감지는
// 회차 수 계산이 실제 배송 지연/수령 확인 누락 등과 자주 어긋나 오탐(false positive)이 잦아
// 제거했다 — delivery_confirm_count 컬럼 자체는 남아있지만 더 이상 이 리포트가 참조하지 않는다.)

import { computeDDay, computeDeadline } from './purchase-logic';
import { buildWeeklyDigestEmailHtml, sendDigestEmail, type WeeklyItem } from './email';
import { sendPush } from './push';
import type { Env, PurchaseRow, PushSubscriptionRow } from '../types';

const UPCOMING_WINDOW_DAYS = 7;

interface RecurringPurchaseWithUser extends PurchaseRow {
  user_email: string;
  user_nickname: string;
  user_email_notifications_enabled: number;
  user_is_premium: number;
}

interface UserWeeklyBucket {
  email: string;
  nickname: string;
  emailEnabled: boolean;
  upcoming: WeeklyItem[];
}

export interface WeeklyDigestRunResult {
  usersNotified: number;
  emailsSent: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

export async function runWeeklyDigest(env: Env): Promise<WeeklyDigestRunResult> {
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.email AS user_email, u.nickname AS user_nickname,
            u.email_notifications_enabled AS user_email_notifications_enabled,
            u.is_premium AS user_is_premium
       FROM purchases p
       JOIN users u ON u.id = p.user_id
      WHERE p.type = 'RECURRING_DELIVERY' AND p.archived_at IS NULL`
  ).all<RecurringPurchaseWithUser>();

  const bucketsByUserId = new Map<number, UserWeeklyBucket>();

  for (const row of results) {
    if (row.user_is_premium !== 1) continue;

    const { deadline } = computeDeadline(row);
    const dDay = computeDDay(deadline);

    const isUpcoming = dDay >= 0 && dDay <= UPCOMING_WINDOW_DAYS;
    if (!isUpcoming) continue;

    const bucket = bucketsByUserId.get(row.user_id) ?? {
      email: row.user_email,
      nickname: row.user_nickname,
      emailEnabled: row.user_email_notifications_enabled === 1,
      upcoming: [],
    };
    bucket.upcoming.push({ itemName: row.item_name, dDay, deadline });
    bucketsByUserId.set(row.user_id, bucket);
  }

  const dashboardUrl = `${env.APP_URL}/dashboard`;
  const subject = '이번 주 정기구독·배송 리포트 — Remindue';
  let emailsSent = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  for (const [userId, { email, nickname, emailEnabled, upcoming }] of bucketsByUserId) {
    upcoming.sort((a, b) => a.dDay - b.dDay);

    if (emailEnabled) {
      const html = buildWeeklyDigestEmailHtml(nickname, upcoming, dashboardUrl);
      const { sent } = await sendDigestEmail(env.RESEND_API_KEY, email, subject, html);
      if (sent) emailsSent += 1;
    }

    const pushBody = `이번 주 배송 예정 ${upcoming.length}건`;

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

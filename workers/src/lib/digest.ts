// Cron Trigger(매일 1회)로 실행되는 D-day 다이제스트 발송 로직.
// "매일 보내면 스팸"이라 D-day가 정확히 7/3/1/0인 항목이 있는 사용자에게만,
// 항목별로 따로가 아니라 사용자당 1통(이메일)/1묶음(푸시)으로 묶어서 보낸다.
// 이메일은 email_notifications_enabled 플래그를 따르고, 푸시는 구독 자체가
// 곧 "받겠다"는 의사표시라 그 플래그와 무관하게(구독이 있으면) 보낸다.

import { computeDDay, computeDeadline } from './purchase-logic';
import { buildDigestEmailHtml, sendDigestEmail } from './email';
import { buildDigestTitle, buildItemMessage, type DigestItem } from './messages';
import { sendPush } from './push';
import type { Env, PurchaseRow, PushSubscriptionRow } from '../types';

const TARGET_DDAYS = new Set([7, 3, 1, 0]);
const PUSH_BODY_MAX_LENGTH = 120;

interface PurchaseWithUser extends PurchaseRow {
  user_email: string;
  user_nickname: string;
  user_email_notifications_enabled: number;
}

interface UserDigestBucket {
  email: string;
  nickname: string;
  emailEnabled: boolean;
  items: DigestItem[];
}

export interface DigestRunResult {
  usersNotified: number;
  emailsSent: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

/** items는 호출부에서 이미 dDay 오름차순으로 정렬돼 있다고 가정한다 — 가장 급한 문구가 앞에 온다. */
function buildPushBody(items: DigestItem[]): string {
  const summary = items.map((item) => buildItemMessage(item)).join(' / ');
  return summary.length > PUSH_BODY_MAX_LENGTH ? `${summary.slice(0, PUSH_BODY_MAX_LENGTH - 1)}…` : summary;
}

export async function runDailyDigest(env: Env): Promise<DigestRunResult> {
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.email AS user_email, u.nickname AS user_nickname,
            u.email_notifications_enabled AS user_email_notifications_enabled
       FROM purchases p
       JOIN users u ON u.id = p.user_id`
  ).all<PurchaseWithUser>();

  const itemsByUserId = new Map<number, UserDigestBucket>();

  for (const row of results) {
    const { deadline } = computeDeadline(row);
    const dDay = computeDDay(deadline);
    if (!TARGET_DDAYS.has(dDay)) continue;

    const bucket = itemsByUserId.get(row.user_id) ?? {
      email: row.user_email,
      nickname: row.user_nickname,
      emailEnabled: row.user_email_notifications_enabled === 1,
      items: [],
    };
    bucket.items.push({ itemName: row.item_name, type: row.type, dDay, deadline });
    itemsByUserId.set(row.user_id, bucket);
  }

  const dashboardUrl = `${env.CORS_ORIGIN}/dashboard`;
  let emailsSent = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  for (const [userId, { email, nickname, emailEnabled, items }] of itemsByUserId) {
    // 급한 순서(0 → 1 → 3 → 7)로 정렬 — 다이제스트 상단과 제목 모두 이 순서를 기준으로 삼는다.
    items.sort((a, b) => a.dDay - b.dDay);
    const subject = `${buildDigestTitle(items)} — Remindue`;

    if (emailEnabled) {
      const html = buildDigestEmailHtml(nickname, items, dashboardUrl);
      const { sent } = await sendDigestEmail(env.RESEND_API_KEY, email, subject, html);
      if (sent) emailsSent += 1;
    }

    const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .bind(userId)
      .all<PushSubscriptionRow>();

    for (const sub of subs) {
      const { sent, gone } = await sendPush(env, sub, {
        title: subject,
        body: buildPushBody(items),
        url: dashboardUrl,
      });
      if (sent) pushSent += 1;
      if (gone) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        pushSubscriptionsPruned += 1;
      }
    }
  }

  return { usersNotified: itemsByUserId.size, emailsSent, pushSent, pushSubscriptionsPruned };
}

/**
 * Weekly upcoming-items digest.
 *
 * The delivery and subscription sections intentionally use separate criteria:
 * - delivery: recurring deliveries and general purchases with an expected arrival date
 * - subscription: recurring subscriptions with an upcoming renewal date
 * Archived, discarded, discontinued, and already-received items are excluded by the query
 * and date selection below.
 */
import { computeDDay, computeDeadline } from './purchase-logic';
import { buildWeeklyDigestEmailHtml, sendDigestEmail, type WeeklyItem } from './email';
import { sendPush } from './push';
import type { Env, PurchaseRow, PushSubscriptionRow } from '../types';

const UPCOMING_WINDOW_DAYS = 7;

interface PurchaseWithUser extends PurchaseRow {
  user_email: string;
  user_nickname: string;
  user_email_notifications_enabled: number;
  user_is_premium: number;
}

interface UserWeeklyBucket {
  email: string;
  nickname: string;
  emailEnabled: boolean;
  deliveries: WeeklyItem[];
  subscriptions: WeeklyItem[];
}

export interface WeeklyDigestRunResult {
  usersNotified: number;
  emailsSent: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

function pushPreview(label: string, items: WeeklyItem[]): string[] {
  return items.slice(0, 2).map((item) => `${label} ${item.deadline.slice(5)} · ${item.itemName}`);
}

function buildPushContent(deliveries: WeeklyItem[], subscriptions: WeeklyItem[]) {
  const deliveryCount = deliveries.length;
  const subscriptionCount = subscriptions.length;
  const title = deliveryCount > 0
    ? `📦 이번 주 도착 예정 ${deliveryCount}건`
    : `💳 이번 주 결제 예정 ${subscriptionCount}건`;
  const lines = [
    ...pushPreview('도착', deliveries),
    ...pushPreview('결제', subscriptions),
  ];
  if (deliveryCount > 2 || subscriptionCount > 2) lines.push('알림을 길게 눌러 전체 내용을 확인하세요.');
  return { title, body: lines.join('\n') || title };
}

export async function runWeeklyDigest(env: Env): Promise<WeeklyDigestRunResult> {
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.email AS user_email, u.nickname AS user_nickname,
            u.email_notifications_enabled AS user_email_notifications_enabled,
            u.is_premium AS user_is_premium
       FROM purchases p
       JOIN users u ON u.id = p.user_id
      WHERE p.type IN ('GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION')
        AND p.archived_at IS NULL
        AND p.discarded_at IS NULL
        AND p.discontinued_at IS NULL
        -- A recurring delivery keeps its last receipt date as history; it must still
        -- be included for its next scheduled arrival. GENERAL purchases do not recur.
        AND (p.type <> 'GENERAL' OR p.last_delivered_date IS NULL)`
  ).all<PurchaseWithUser>();

  const bucketsByUserId = new Map<number, UserWeeklyBucket>();
  const bucketFor = (row: PurchaseWithUser) => {
    const existing = bucketsByUserId.get(row.user_id);
    if (existing) return existing;
    const bucket: UserWeeklyBucket = {
      email: row.user_email,
      nickname: row.user_nickname,
      emailEnabled: row.user_email_notifications_enabled === 1,
      deliveries: [],
      subscriptions: [],
    };
    bucketsByUserId.set(row.user_id, bucket);
    return bucket;
  };

  for (const row of results) {
    if (row.user_is_premium !== 1) continue;

    if (row.type === 'GENERAL') {
      if (!row.expected_delivery_date) continue;
      const dDay = computeDDay(row.expected_delivery_date);
      if (dDay >= 0 && dDay <= UPCOMING_WINDOW_DAYS) {
        bucketFor(row).deliveries.push({ itemName: row.item_name, dDay, deadline: row.expected_delivery_date });
      }
      continue;
    }

    const { deadline } = computeDeadline(row);
    const dDay = computeDDay(deadline);
    if (dDay < 0 || dDay > UPCOMING_WINDOW_DAYS) continue;

    if (row.type === 'RECURRING_DELIVERY') {
      bucketFor(row).deliveries.push({ itemName: row.item_name, dDay, deadline });
    } else if (row.type === 'SUBSCRIPTION' && row.is_one_time === 0) {
      // A one-time subscription remains usable for its term, but has no next payment to notify.
      bucketFor(row).subscriptions.push({ itemName: row.item_name, dDay, deadline });
    }
  }

  const dashboardUrl = `${env.APP_URL}/dashboard`;
  let emailsSent = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  for (const [userId, bucket] of bucketsByUserId) {
    const { email, nickname, emailEnabled, deliveries, subscriptions } = bucket;
    deliveries.sort((a, b) => a.deadline.localeCompare(b.deadline));
    subscriptions.sort((a, b) => a.deadline.localeCompare(b.deadline));
    const { title, body } = buildPushContent(deliveries, subscriptions);

    if (emailEnabled) {
      const html = buildWeeklyDigestEmailHtml(nickname, deliveries, subscriptions, dashboardUrl);
      const { sent } = await sendDigestEmail(env.RESEND_API_KEY, email, title, html);
      if (sent) emailsSent += 1;
    }

    const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .bind(userId)
      .all<PushSubscriptionRow>();

    for (const sub of subs) {
      const { sent, gone } = await sendPush(env, sub, {
        title,
        body,
        url: dashboardUrl,
        actions: [{ action: 'open_dashboard', title: '전체 보기' }],
      });
      if (sent) pushSent += 1;
      if (gone) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        pushSubscriptionsPruned += 1;
      }
    }
  }

  return { usersNotified: bucketsByUserId.size, emailsSent, pushSent, pushSubscriptionsPruned };
}

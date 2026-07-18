// Web Push 발송 — web-push 라이브러리를 그대로 쓴다(nodejs_compat 플래그로 node:crypto/https 지원).
// 이메일과 마찬가지로 키가 없으면(로컬 개발 등) 실제 전송은 건너뛰고 콘솔에만 남긴다.

import webpush from 'web-push';
import type { Env, PushSubscriptionRow } from '../types';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSendResult {
  sent: boolean;
  /** true면 구독이 더 이상 유효하지 않다는 뜻(404/410) — 호출부에서 DB에서 삭제해야 한다. */
  gone: boolean;
}

export async function sendPush(env: Env, sub: PushSubscriptionRow, payload: PushPayload): Promise<PushSendResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.warn(`[push] VAPID 키가 없어 발송을 건너뜁니다 (endpoint: ${sub.endpoint})`);
    return { sent: false, gone: false };
  }

  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { sent: true, gone: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      console.warn(`[push] 구독이 만료되어 삭제 대상입니다 (endpoint: ${sub.endpoint})`);
      return { sent: false, gone: true };
    }
    console.error('[push] 발송 실패', err);
    return { sent: false, gone: false };
  }
}

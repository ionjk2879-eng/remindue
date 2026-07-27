// Web Push 발송 — web-push 라이브러리를 그대로 쓴다(nodejs_compat 플래그로 node:crypto/https 지원).
// 이메일과 마찬가지로 키가 없으면(로컬 개발 등) 실제 전송은 건너뛰고 콘솔에만 남긴다.

import webpush from 'web-push';
import type { Env, PushSubscriptionRow } from '../types';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** 알림 화면에서 구분할 용도. 서비스 워커가 유형별 색 아이콘을 고른다. */
  notificationKind?: 'DEADLINE' | 'RENEWAL' | 'ARRIVAL' | 'WEEKLY_SUMMARY';
  /**
   * 알림에 액션 버튼("유지하기"/"나중에" 등)을 붙일 때만 채운다 — Notification API의
   * actions와 그대로 매핑된다(sw.ts). 지원 안 하는 플랫폼(iOS Safari 등)에서는 그냥
   * 무시되고 알림 본문을 탭했을 때의 기본 동작(앱 열기)만 동작한다.
   */
  actions?: { action: string; title: string }[];
  /** actions와 짝을 이루는 1회성 토큰(action-tokens.ts) — 서비스워커가 버튼 클릭 시 인증
   *  없이 /api/push/confirm-action을 호출할 때 쓴다. actions가 없으면 의미 없다. */
  actionToken?: string;
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

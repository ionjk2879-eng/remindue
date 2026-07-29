// Firebase Cloud Messaging HTTP v1 API — Cloudflare Workers에서는 firebase-admin을 쓸 수 없어
// Web Crypto API로 서비스 계정 JWT를 직접 서명하고 Google OAuth2 토큰을 교환한다.

import type { PushPayload } from './push';
import { logger } from './logger';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FcmSendResult {
  sent: boolean;
  /** true면 토큰이 더 이상 유효하지 않음 — 호출부에서 DB에서 삭제해야 한다. */
  gone: boolean;
}

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importServiceAccountKey(pem: string): Promise<CryptoKey> {
  const content = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }));

  const signingInput = `${header}.${claim}`;
  const key = await importServiceAccountKey(sa.private_key);
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(new Uint8Array(signatureBytes))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status}`);
  const { access_token } = await res.json<{ access_token: string }>();
  return access_token;
}

// PWA(sw.ts)는 알림마다 색이 다른 시계 PNG를 그대로 아이콘으로 쓰지만, Android 상태바
// 아이콘은 항상 단색으로 강제 렌더링되기 때문에 같은 방식을 쓸 수 없다. 대신 알림의 accent
// color(원형 배경 틴트)를 종류별로 다르게 주고, 펼친 화면에는 같은 PNG를 큰 이미지로 보여줘
// PWA와 시각적으로 최대한 비슷하게 맞춘다.
const NOTIFICATION_STYLE: Record<NonNullable<PushPayload['notificationKind']>, { color: string; image: string }> = {
  DEADLINE: { color: '#6A7BA8', image: '/notification-deadline.png' },
  RENEWAL: { color: '#8A9B6A', image: '/notification-renewal.png' },
  ARRIVAL: { color: '#2f6f5e', image: '/notification-arrival.png' },
  WEEKLY_SUMMARY: { color: '#7B6FA3', image: '/notification-weekly-summary.png' },
};

async function sendWithToken(
  projectId: string,
  accessToken: string,
  fcmToken: string,
  payload: PushPayload
): Promise<FcmSendResult> {
  const style = payload.notificationKind ? NOTIFICATION_STYLE[payload.notificationKind] : undefined;
  let origin: string | undefined;
  try {
    origin = new URL(payload.url).origin;
  } catch {
    origin = undefined;
  }

  const message = {
    message: {
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: {
        url: payload.url,
        notificationKind: payload.notificationKind ?? '',
        ...(payload.actionToken ? { actionToken: payload.actionToken } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channel_id: 'remindue_default',
          ...(style ? { color: style.color } : {}),
          ...(style && origin ? { image: `${origin}${style.image}` } : {}),
        },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    }
  );

  if (res.ok) return { sent: true, gone: false };

  const status = res.status;
  const body = await res.text().catch(() => '');
  if (status === 404 || status === 410 || body.includes('UNREGISTERED') || body.includes('INVALID_ARGUMENT')) {
    logger.warn('fcm.token_invalid', { status });
    return { sent: false, gone: true };
  }
  logger.error('fcm.send_failed', { status, body: body.slice(0, 200) });
  return { sent: false, gone: false };
}

/**
 * cron 1회 실행 동안 OAuth 토큰을 한 번만 발급하고 재사용하는 FCM 발송기.
 * FIREBASE_SERVICE_ACCOUNT가 없으면 null을 반환 — 호출부에서 null 체크 후 건너뛴다.
 */
export function makeFcmSender(serviceAccountJson: string | undefined) {
  if (!serviceAccountJson) return null;

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    logger.error('fcm.invalid_service_account', {});
    return null;
  }

  let tokenPromise: Promise<string> | null = null;

  return async (fcmToken: string, payload: PushPayload): Promise<FcmSendResult> => {
    if (!tokenPromise) tokenPromise = getAccessToken(sa);
    try {
      const accessToken = await tokenPromise;
      return await sendWithToken(sa.project_id, accessToken, fcmToken, payload);
    } catch (err) {
      logger.error('fcm.send_error', { error: String(err) });
      return { sent: false, gone: false };
    }
  };
}

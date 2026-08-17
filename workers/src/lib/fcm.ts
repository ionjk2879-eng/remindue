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

// data-only 메시지로 보낸다 — 최상위 "notification" 필드가 있으면 앱이 백그라운드/종료
// 상태일 때 Play Services가 onMessageReceived 호출 전에 알림을 직접 그려버려서, actions(유지
// 하기/나중에 버튼)를 붙일 기회 자체가 없다. data만 보내면 앱 상태와 무관하게 항상
// RemindueMessagingService.onMessageReceived가 호출되어 우리가 직접 버튼 달린 알림을 그릴 수
// 있다(frontend/android/app/src/main/java/com/remindue/app/RemindueMessagingService.java).
// 그 파일에 색상 팔레트·채널 생성 등 표시 관련 로직이 전부 있고, 여기서는 값만 문자열로
// 실어 보낸다(FCM data 페이로드는 모든 값이 string이어야 함).
async function sendWithToken(
  projectId: string,
  accessToken: string,
  fcmToken: string,
  payload: PushPayload
): Promise<FcmSendResult> {
  const message = {
    message: {
      token: fcmToken,
      data: {
        title: payload.title,
        body: payload.body,
        url: payload.url,
        notificationKind: payload.notificationKind ?? '',
        ...(payload.actionToken ? { actionToken: payload.actionToken } : {}),
        ...(payload.actions ? { actions: JSON.stringify(payload.actions) } : {}),
      },
      android: {
        priority: 'high',
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

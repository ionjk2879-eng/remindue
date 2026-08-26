import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { signJwt } from '../lib/jwt';
import { generateForwardingToken } from './auth';
import { logger } from '../lib/logger';
import type { Env, UserRow } from '../types';
import { FREE_NOTIFICATION_DAYS } from '../../../shared/domain-policy';

const REFRESH_TOKEN_EXPIRATION_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_COOKIE = 'remindue_refresh';

interface GoogleTokenResponse {
  access_token: string;
  error?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
}

const googleAuth = new Hono<{ Bindings: Env }>();

function callbackUri(requestUrl: string): string {
  return `${new URL(requestUrl).origin}/api/auth/google/callback`;
}

googleAuth.get('/google', (c) => {
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUri(c.req.url),
    response_type: 'code',
    scope: 'email profile',
    access_type: 'online',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

googleAuth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const frontendUrl = c.env.APP_URL;

  if (!code || error) {
    return c.redirect(`${frontendUrl}/login?error=google_cancelled`);
  }

  try {
    // Google 인증 코드 → 액세스 토큰 교환
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUri(c.req.url),
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json<GoogleTokenResponse>();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(`Google token exchange failed: ${tokenRes.status}`);
    }

    // Google 사용자 정보 조회
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userInfoRes.ok) throw new Error(`Google userinfo failed: ${userInfoRes.status}`);
    const googleUser = await userInfoRes.json<GoogleUserInfo>();

    // 기존 계정 조회 (google_id 우선, 이메일 차선)
    let user = await c.env.DB.prepare('SELECT * FROM users WHERE google_id = ?')
      .bind(googleUser.id).first<UserRow>();

    if (!user) {
      user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
        .bind(googleUser.email).first<UserRow>();

      if (user) {
        // 이메일로 가입된 기존 계정에 google_id 연결
        await c.env.DB.prepare('UPDATE users SET google_id = ? WHERE id = ?')
          .bind(googleUser.id, user.id).run();
        logger.info('auth.google.linked', { userId: user.id });
      } else {
        // 신규 가입
        let inserted = false;
        for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
          try {
            await c.env.DB.prepare(
              `INSERT INTO users
                (email, password_hash, nickname, forwarding_token, is_premium,
                 notification_days, renewal_notification_days, google_id)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
            ).bind(
              googleUser.email,
              `google:${crypto.randomUUID()}`,
              googleUser.name || googleUser.email.split('@')[0],
              generateForwardingToken(),
              FREE_NOTIFICATION_DAYS.join(','),
              FREE_NOTIFICATION_DAYS.join(','),
              googleUser.id,
            ).run();
            inserted = true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes('UNIQUE') || !msg.includes('forwarding_token')) throw err;
          }
        }
        user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
          .bind(googleUser.email).first<UserRow>();
        logger.info('auth.google.signup', { email: googleUser.email });
      }
    }

    if (!user) throw new Error('사용자를 생성하지 못했습니다');

    // refresh 세션 발급
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_SECONDS * 1000).toISOString();
    await c.env.DB.prepare(
      "DELETE FROM refresh_sessions WHERE user_id = ? AND (revoked_at IS NOT NULL OR expires_at <= datetime('now'))"
    ).bind(user.id).run();
    await c.env.DB.prepare('INSERT INTO refresh_sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, user.id, expiresAt).run();

    const refreshToken = await signJwt(
      user.email, c.env.JWT_SECRET, REFRESH_TOKEN_EXPIRATION_SECONDS, 'refresh', sessionId
    );

    const secure = new URL(c.req.url).protocol === 'https:';
    // 쿠키도 설정하지만(일부 브라우저에서 동작할 수 있음), 주된 인증은
    // 프론트엔드가 해시 토큰을 받아 cross-site POST로 교환하는 방식을 사용한다.
    // (CHIPS 파티셔닝 때문에 이 쿠키는 remindue.kr에서 전송되지 않을 수 있다)
    setCookie(c, REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      partitioned: secure,
      sameSite: secure ? 'None' as const : 'Lax' as const,
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_EXPIRATION_SECONDS,
    });

    logger.info('auth.google.success', { userId: user.id });
    // 리프레시 토큰을 해시 프래그먼트로 전달 — 서버 로그에 남지 않는다.
    // GoogleAuthSuccessPage가 이를 추출해 /api/auth/refresh에 body로 POST하면
    // 쿠키가 remindue.kr 파티션으로 올바르게 설정된다.
    return c.redirect(`${frontendUrl}/auth/google/success#rt=${encodeURIComponent(refreshToken)}`);

  } catch (err) {
    logger.error('auth.google.error', { error: err instanceof Error ? err.message : String(err) });
    return c.redirect(`${frontendUrl}/login?error=google_failed`);
  }
});

export default googleAuth;

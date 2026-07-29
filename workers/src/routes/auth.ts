// Mirrors backend/src/main/java/com/remindue/auth/AuthController.java

import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { hashPassword, verifyPassword } from '../lib/password';
import { signJwt, verifyJwt } from '../lib/jwt';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError, ConflictError } from '../lib/errors';
import type { AuthResponse, Env, UserRow } from '../types';

const ACCESS_TOKEN_EXPIRATION_SECONDS = 60 * 60; // 1시간 — application.yml의 access-token-expiration-ms와 동일
const REFRESH_TOKEN_EXPIRATION_SECONDS = 60 * 60 * 24 * 30;
const REFRESH_COOKIE = 'remindue_refresh';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * {token}@{도메인} 형태의 개인 포워딩 주소에 쓸 토큰.
 * 6자리 소문자(a-z) — 26^6 ≈ 3억 조합, 짧고 깔끔하다.
 */
export function generateForwardingToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % 26]).join('');
}

interface SignupBody {
  email?: string;
  password?: string;
  nickname?: string;
  native?: boolean;
}

interface LoginBody {
  email?: string;
  password?: string;
  rememberMe?: boolean;
  native?: boolean;
}

function requireEmail(email: unknown): string {
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestError('올바른 이메일 형식이 아닙니다');
  }
  return email;
}

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
type AuthContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

function requireAllowedOrigin(c: AuthContext): void {
  const origin = c.req.header('Origin');
  if (!origin) return;
  const allowed = c.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw new BadRequestError('허용되지 않은 요청 출처입니다');
}

interface SessionOptions {
  rememberMe?: boolean; // false → 세션 쿠키(브라우저 닫으면 만료), 기본 true
  native?: boolean;     // true → 쿠키 대신 응답 바디에 refreshToken 포함
}

function refreshCookieOptions(c: { req: { url: string } }, rememberMe = true) {
  const secure = new URL(c.req.url).protocol === 'https:';
  return {
    httpOnly: true,
    secure,
    partitioned: secure,
    sameSite: secure ? 'None' as const : 'Lax' as const,
    path: '/api/auth',
    ...(rememberMe ? { maxAge: REFRESH_TOKEN_EXPIRATION_SECONDS } : {}),
  };
}

async function issueSession(c: AuthContext, user: UserRow, opts: SessionOptions = {}): Promise<AuthResponse> {
  const { rememberMe = true, native = false } = opts;
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRATION_SECONDS * 1000).toISOString();
  await c.env.DB.prepare(
    "DELETE FROM refresh_sessions WHERE user_id = ? AND (revoked_at IS NOT NULL OR expires_at <= datetime('now'))"
  ).bind(user.id).run();
  await c.env.DB.prepare('INSERT INTO refresh_sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, user.id, expiresAt)
    .run();
  const [accessToken, refreshToken] = await Promise.all([
    signJwt(user.email, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRATION_SECONDS, 'access'),
    signJwt(user.email, c.env.JWT_SECRET, REFRESH_TOKEN_EXPIRATION_SECONDS, 'refresh', sessionId),
  ]);
  setCookie(c, REFRESH_COOKIE, refreshToken, refreshCookieOptions(c, rememberMe));
  const response: AuthResponse = {
    accessToken,
    nickname: user.nickname,
    isPremium: user.is_premium === 1,
    hasSeenOnboarding: user.has_seen_onboarding === 1,
  };
  if (native) response.refreshToken = refreshToken;
  return response;
}

async function revokeRefreshSession(c: AuthContext): Promise<void> {
  const token = getCookie(c, REFRESH_COOKIE);
  if (token) {
    const payload = await verifyJwt(token, c.env.JWT_SECRET);
    if (payload?.type === 'refresh' && payload.jti) {
      await c.env.DB.prepare("UPDATE refresh_sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")
        .bind(payload.jti)
        .run();
    }
  }
  deleteCookie(c, REFRESH_COOKIE, refreshCookieOptions(c));
}

auth.post('/signup', async (c) => {
  requireAllowedOrigin(c);
  const body = await c.req.json<SignupBody>().catch(() => ({}) as SignupBody);
  const native = body.native ?? false;
  const email = requireEmail(body.email);
  const password = body.password;
  const nickname = body.nickname?.trim();

  if (!password || password.length < 8) {
    throw new BadRequestError('비밀번호는 8자 이상이어야 합니다');
  }
  if (!nickname) {
    throw new BadRequestError('닉네임을 입력해주세요');
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    throw new ConflictError('이미 가입된 이메일입니다');
  }

  const passwordHash = await hashPassword(password);

  // forwarding_token은 UNIQUE라 128비트 랜덤값이 우연히 겹치는 극히 드문 경우에만 재시도한다.
  // is_premium은 컬럼 기본값(1)에 기대지 않고 여기서 명시적으로 0을 넣는다 — 결제 연동 전까지
  // 신규 가입자는 무료 플랜으로 시작한다. 기존에 만들어져 있던 계정들은 건드리지 않는다.
  let inserted = false;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    try {
      await c.env.DB.prepare(
        'INSERT INTO users (email, password_hash, nickname, forwarding_token, is_premium) VALUES (?, ?, ?, ?, 0)'
      )
        .bind(email, passwordHash, nickname, generateForwardingToken())
        .run();
      inserted = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('UNIQUE') || !message.includes('forwarding_token')) throw err;
    }
  }
  if (!inserted) {
    throw new Error('forwarding_token 발급에 반복 실패했습니다');
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) throw new Error('가입한 사용자를 다시 조회하지 못했습니다');
  return c.json(await issueSession(c, user, { native }));
});

auth.post('/login', async (c) => {
  requireAllowedOrigin(c);
  const body = await c.req.json<LoginBody>().catch(() => ({}) as LoginBody);
  const email = requireEmail(body.email);
  const password = body.password;
  const rememberMe = body.rememberMe ?? true;
  const native = body.native ?? false;
  if (!password) {
    throw new BadRequestError('비밀번호를 입력해주세요');
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new BadRequestError('이메일 또는 비밀번호가 올바르지 않습니다');
  }

  return c.json(await issueSession(c, user, { rememberMe, native }));
});

auth.post('/refresh', async (c) => {
  requireAllowedOrigin(c);
  const body = await c.req.json<{ refreshToken?: string; native?: boolean }>().catch(() => ({}) as { refreshToken?: string; native?: boolean });
  const native = body.native ?? false;
  // 쿠키 우선, 없으면 네이티브 앱이 바디로 전달한 토큰 사용
  const token = getCookie(c, REFRESH_COOKIE) ?? body.refreshToken;
  if (!token) return c.json({ message: '세션이 없습니다' }, 401);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (payload?.type !== 'refresh' || !payload.jti) {
    deleteCookie(c, REFRESH_COOKIE, refreshCookieOptions(c));
    return c.json({ message: '유효하지 않은 세션입니다' }, 401);
  }

  const session = await c.env.DB.prepare(
    `SELECT rs.id, rs.user_id
       FROM refresh_sessions rs
       JOIN users u ON u.id = rs.user_id
      WHERE rs.id = ? AND u.email = ? AND rs.revoked_at IS NULL AND rs.expires_at > datetime('now')`
  ).bind(payload.jti, payload.sub).first<{ id: string; user_id: number }>();
  if (!session) {
    deleteCookie(c, REFRESH_COOKIE, refreshCookieOptions(c));
    return c.json({ message: '만료되었거나 폐기된 세션입니다' }, 401);
  }

  // refresh token은 한 번 사용하면 즉시 폐기하고 새 세션으로 회전한다.
  const claimed = await c.env.DB.prepare("UPDATE refresh_sessions SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")
    .bind(session.id)
    .run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    deleteCookie(c, REFRESH_COOKIE, refreshCookieOptions(c));
    return c.json({ message: '이미 사용된 세션입니다' }, 401);
  }
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first<UserRow>();
  if (!user) return c.json({ message: '사용자를 찾을 수 없습니다' }, 401);
  return c.json(await issueSession(c, user, { native }));
});

auth.post('/logout', async (c) => {
  requireAllowedOrigin(c);
  await revokeRefreshSession(c);
  return c.body(null, 204);
});

/**
 * 회원탈퇴 — 비밀번호 재확인 후 순수 개인 데이터(등록 항목, 알림 구독, 공유 정보)는 지우고,
 * users 행 자체는 삭제 대신 "익명화"한다(이메일/닉네임/비밀번호를 복구 불가능한 값으로
 * 덮어써서 더 이상 특정 개인을 식별할 수 없게 만든다 — 개인정보보호법상 "파기"는 삭제뿐 아니라
 * 익명화도 인정되는 방법이다). subscriptions/payments는 그대로 두고 status만 정기결제 해지와
 * 동일하게 처리한다.
 *
 * 이렇게 하는 이유: 전자상거래법 시행령 제6조가 "계약 또는 청약철회 등에 관한 기록"과 "대금결제
 * 및 재화 등의 공급에 관한 기록"을 최소 5년간 보관하도록 의무화한다. users 행을 실제로 DELETE하면
 * subscriptions/payments의 user_id가 ON DELETE CASCADE로 걸려있어(로컬 D1에서 실제로 재현
 * 확인함 — D1은 foreign_keys pragma가 켜져 있다) 이 법정 보관 기록까지 통째로 같이 사라져버린다.
 * 스키마에서 그 CASCADE만 떼어내려는 시도(테이블 재생성 마이그레이션)는 원격 D1에서 FK 제약
 * 오류로 실패했고(로컬 SQLite와 원격 D1의 PRAGMA/ALTER TABLE 처리 차이로 추정), 실거래 데이터가
 * 걸린 테이블에 그런 위험한 스키마 수술을 강행하기보다 애초에 users 행을 지우지 않는 이 방식이
 * 더 안전하다.
 */
auth.delete('/account', authMiddleware, async (c) => {
  const email = c.get('userEmail');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }

  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  if (!body.password || !(await verifyPassword(body.password, user.password_hash))) {
    throw new BadRequestError('비밀번호가 올바르지 않습니다');
  }

  // 이메일/포워딩 토큰은 UNIQUE라 탈퇴한 계정마다 겹치지 않는 값이어야 한다.
  const anonymizedEmail = `deleted-${user.id}-${crypto.randomUUID()}@remindue.invalid`;
  const anonymizedPasswordHash = await hashPassword(crypto.randomUUID() + crypto.randomUUID());

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE refresh_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").bind(user.id),
    c.env.DB.prepare('DELETE FROM purchases WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM pending_purchases WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM shared_access WHERE owner_user_id = ?').bind(user.id),
    // 진행 중이던 정기결제가 있었다면 해지와 동일하게 처리 — 더 이상 청구 대상이 아니게.
    c.env.DB.prepare(
      `UPDATE subscriptions SET status = 'CANCELED', auto_renew = 0, toss_billing_key = NULL, updated_at = datetime('now')
        WHERE user_id = ? AND status = 'ACTIVE'`
    ).bind(user.id),
    c.env.DB.prepare(
      `UPDATE users
          SET email = ?, password_hash = ?, nickname = '탈퇴한 회원', forwarding_token = ?,
              is_premium = 0, premium_expires_at = NULL, toss_customer_key = NULL
        WHERE id = ?`
    ).bind(anonymizedEmail, anonymizedPasswordHash, generateForwardingToken(), user.id),
  ]);

  deleteCookie(c, REFRESH_COOKIE, refreshCookieOptions(c));

  return c.body(null, 204);
});

export default auth;

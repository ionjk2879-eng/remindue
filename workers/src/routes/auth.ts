// Mirrors backend/src/main/java/com/remindue/auth/AuthController.java

import { Hono } from 'hono';
import { hashPassword, verifyPassword } from '../lib/password';
import { signJwt } from '../lib/jwt';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError, ConflictError } from '../lib/errors';
import type { AuthResponse, Env, UserRow } from '../types';

const ACCESS_TOKEN_EXPIRATION_SECONDS = 60 * 60; // 1시간 — application.yml의 access-token-expiration-ms와 동일
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
}

interface LoginBody {
  email?: string;
  password?: string;
}

function requireEmail(email: unknown): string {
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestError('올바른 이메일 형식이 아닙니다');
  }
  return email;
}

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auth.post('/signup', async (c) => {
  const body = await c.req.json<SignupBody>().catch(() => ({}) as SignupBody);
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

  const accessToken = await signJwt(email, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRATION_SECONDS);
  const response: AuthResponse = { accessToken, nickname, isPremium: false, hasSeenOnboarding: false };
  return c.json(response);
});

auth.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>().catch(() => ({}) as LoginBody);
  const email = requireEmail(body.email);
  const password = body.password;
  if (!password) {
    throw new BadRequestError('비밀번호를 입력해주세요');
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new BadRequestError('이메일 또는 비밀번호가 올바르지 않습니다');
  }

  const accessToken = await signJwt(email, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRATION_SECONDS);
  const response: AuthResponse = {
    accessToken,
    nickname: user.nickname,
    isPremium: user.is_premium === 1,
    hasSeenOnboarding: user.has_seen_onboarding === 1,
  };
  return c.json(response);
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

  return c.body(null, 204);
});

export default auth;

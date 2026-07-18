// Mirrors backend/src/main/java/com/remindue/auth/AuthController.java

import { Hono } from 'hono';
import { hashPassword, verifyPassword } from '../lib/password';
import { signJwt } from '../lib/jwt';
import { BadRequestError, ConflictError } from '../lib/errors';
import type { AuthResponse, Env, UserRow } from '../types';

const ACCESS_TOKEN_EXPIRATION_SECONDS = 60 * 60; // 1시간 — application.yml의 access-token-expiration-ms와 동일
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * add-{token}@{도메인} 형태의 개인 포워딩 주소에 쓸 32자리(16바이트=128비트) hex 토큰.
 * 이 주소를 아는 것만으로 어느 계정으로 항목이 등록될지 결정되므로, 추측/무차별 대입이
 * 사실상 불가능한 길이(요구사항: 최소 20자 이상)로 잡는다.
 */
function generateForwardingToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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

const auth = new Hono<{ Bindings: Env }>();

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
  let inserted = false;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    try {
      await c.env.DB.prepare(
        'INSERT INTO users (email, password_hash, nickname, forwarding_token) VALUES (?, ?, ?, ?)'
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
  const response: AuthResponse = { accessToken, nickname };
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
  const response: AuthResponse = { accessToken, nickname: user.nickname };
  return c.json(response);
});

export default auth;

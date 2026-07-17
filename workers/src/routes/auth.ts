// Mirrors backend/src/main/java/com/remindue/auth/AuthController.java

import { Hono } from 'hono';
import { hashPassword, verifyPassword } from '../lib/password';
import { signJwt } from '../lib/jwt';
import { BadRequestError, ConflictError } from '../lib/errors';
import type { AuthResponse, Env, UserRow } from '../types';

const ACCESS_TOKEN_EXPIRATION_SECONDS = 60 * 60; // 1시간 — application.yml의 access-token-expiration-ms와 동일
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  await c.env.DB.prepare('INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)')
    .bind(email, passwordHash, nickname)
    .run();

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

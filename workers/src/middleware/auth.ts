import { createMiddleware } from 'hono/factory';
import { verifyJwt } from '../lib/jwt';
import { UnauthorizedError } from '../lib/errors';
import type { Env } from '../types';

export type AuthVariables = {
  userEmail: string;
};

const BEARER_PREFIX = 'Bearer ';

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError('인증이 필요합니다');
  }

  const token = header.slice(BEARER_PREFIX.length);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    throw new UnauthorizedError('유효하지 않거나 만료된 토큰입니다');
  }

  c.set('userEmail', payload.sub);
  await next();
});

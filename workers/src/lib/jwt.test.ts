import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signJwt, verifyJwt } from './jwt';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';

describe('JWT token types', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z')));
  afterEach(() => vi.useRealTimers());

  it('signs access tokens without a refresh session id', async () => {
    const token = await signJwt('user@example.com', SECRET, 3600);
    await expect(verifyJwt(token, SECRET)).resolves.toMatchObject({
      sub: 'user@example.com',
      type: 'access',
    });
  });

  it('binds refresh tokens to a server-side session id', async () => {
    const token = await signJwt('user@example.com', SECRET, 3600, 'refresh', 'session-id');
    await expect(verifyJwt(token, SECRET)).resolves.toMatchObject({
      type: 'refresh',
      jti: 'session-id',
    });
  });

  it('rejects expired and tampered tokens', async () => {
    const expired = await signJwt('user@example.com', SECRET, -1);
    await expect(verifyJwt(expired, SECRET)).resolves.toBeNull();

    const valid = await signJwt('user@example.com', SECRET, 3600);
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
    await expect(verifyJwt(tampered, SECRET)).resolves.toBeNull();
  });
});

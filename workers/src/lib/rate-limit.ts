// 로그인 브루트포스 / 가입 스팸 방지 — D1의 rate_limit_attempts 테이블에 시도 횟수를 누적하고,
// 윈도우 내 한도를 넘기면 일정 시간 잠근다. Workers는 요청 간 메모리를 공유하지 않으므로
// KV/카운터 대신 이미 있는 D1을 그대로 쓴다.

import { HttpError } from './errors';

export class TooManyRequestsError extends HttpError {
  constructor(message: string) {
    super(429, message);
  }
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
}

interface AttemptRow {
  attempt_count: number;
  window_started_at: string;
  locked_until: string | null;
}

/** 직전 recordAttempt로 한도를 넘겨 아직 잠금 시간이 지나지 않았으면 던진다. */
export async function assertNotLocked(db: D1Database, identifier: string, message: string): Promise<void> {
  const row = await db.prepare('SELECT locked_until FROM rate_limit_attempts WHERE identifier = ?')
    .bind(identifier)
    .first<{ locked_until: string | null }>();
  if (row?.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    throw new TooManyRequestsError(message);
  }
}

/** 시도 1회를 기록한다. 윈도우가 지났으면 카운트를 리셋하고, 윈도우 내 한도를 넘기면 잠근다. */
export async function recordAttempt(db: D1Database, identifier: string, config: RateLimitConfig): Promise<void> {
  const now = Date.now();
  const row = await db.prepare('SELECT * FROM rate_limit_attempts WHERE identifier = ?')
    .bind(identifier)
    .first<AttemptRow>();

  const windowExpired = !row || now - new Date(row.window_started_at).getTime() > config.windowSeconds * 1000;
  const nextCount = windowExpired ? 1 : row.attempt_count + 1;
  const windowStartedAt = windowExpired ? new Date(now).toISOString() : row.window_started_at;
  const lockedUntil = nextCount >= config.maxAttempts ? new Date(now + config.lockoutSeconds * 1000).toISOString() : null;

  await db.prepare(
    `INSERT INTO rate_limit_attempts (identifier, attempt_count, window_started_at, locked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(identifier) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       window_started_at = excluded.window_started_at,
       locked_until = excluded.locked_until`
  ).bind(identifier, nextCount, windowStartedAt, lockedUntil).run();
}

/** 로그인 성공 시 그 식별자의 시도 기록을 지운다. */
export async function clearAttempts(db: D1Database, identifier: string): Promise<void> {
  await db.prepare('DELETE FROM rate_limit_attempts WHERE identifier = ?').bind(identifier).run();
}

export function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') ?? 'unknown';
}

// billing-renewal 등 D1을 직접 쓰는 로직을 실제 SQL 실행으로 테스트하기 위한 가짜 D1.
// Node 내장 node:sqlite(진짜 SQLite 엔진)를 D1Database와 같은 모양(prepare/bind/run/first/all)으로
// 감싸기만 한다 — SQL 파서를 직접 구현하지 않으므로 datetime()/조인/서브쿼리 등 실제 쿼리가
// 그대로 정확히 동작한다. src/ 밖(workers/test/)에 둬서 tsc(tsconfig.json의 include=["src", ...])의
// 타입체크 대상에서 완전히 제외한다 — node:sqlite 타입을 위해 @types/node를 깔면 Workers 전역
// 타입(fetch/Response 등)과 충돌할 수 있어서다. vitest는 esbuild로 트랜스파일만 하고 타입은
// 보지 않으므로 이 파일에 타입 선언이 없어도 테스트 실행에는 문제가 없다.

import { DatabaseSync } from 'node:sqlite';

// billing-renewal.ts가 실제로 참조하는 컬럼만 최소로 재현한 스키마 (migrations/0001, 0003,
// 0010, 0011, 0045, 0046 참고).
const SCHEMA_SQL = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    nickname TEXT NOT NULL,
    email_notifications_enabled INTEGER NOT NULL DEFAULT 1,
    is_premium INTEGER NOT NULL DEFAULT 0,
    premium_expires_at TEXT,
    toss_customer_key TEXT
  );

  CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    auto_renew INTEGER NOT NULL DEFAULT 0,
    toss_billing_key TEXT,
    kakao_sid TEXT,
    current_period_end TEXT NOT NULL,
    failed_charge_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    subscription_id INTEGER REFERENCES subscriptions(id),
    order_id TEXT NOT NULL UNIQUE,
    payment_key TEXT,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    failure_reason TEXT,
    pg_provider TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT
  );
`;

export interface FakeD1 {
  // 실제 D1Database와 동일한 모양이라 프로덕션 코드가 env.DB로 받는 타입과 구조적으로
  // 호환된다. 실제 D1처럼 bind() 없이 곧바로 run()/first()/all()을 호출하는 것도 지원한다
  // (바인딩할 파라미터가 없는 쿼리, 예: runPremiumExpirySweep).
  prepare(sql: string): FakeD1BoundStatement & { bind(...args: unknown[]): FakeD1BoundStatement };
  raw: DatabaseSync;
}

interface FakeD1BoundStatement {
  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }>;
  first<T>(column?: string): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; success: true }>;
}

export function createFakeD1(): FakeD1 {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);

  return {
    raw: db,
    prepare(sql: string) {
      const boundStatement = (args: unknown[]): FakeD1BoundStatement => ({
        async run() {
          const info = db.prepare(sql).run(...(args as never[]));
          return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
        },
        async first<T>(column?: string) {
          const row = db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined;
          if (!row) return null;
          return (column ? row[column] : row) as T | null;
        },
        async all<T>() {
          const rows = db.prepare(sql).all(...(args as never[])) as T[];
          return { results: rows, success: true };
        },
      });
      return { ...boundStatement([]), bind: (...args: unknown[]) => boundStatement(args) };
    },
  };
}

/** 테스트에서 구독/유저 픽스처를 짧게 심기 위한 헬퍼. */
export function seedUser(db: FakeD1, overrides: Partial<{
  email: string; nickname: string; email_notifications_enabled: number; is_premium: number;
  premium_expires_at: string | null; toss_customer_key: string | null;
}> = {}): number {
  const u = {
    email: 'user@example.com', nickname: '테스터', email_notifications_enabled: 1,
    is_premium: 1, premium_expires_at: null, toss_customer_key: 'customer-key-1',
    ...overrides,
  };
  const info = db.raw.prepare(
    'INSERT INTO users (email, nickname, email_notifications_enabled, is_premium, premium_expires_at, toss_customer_key) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(u.email, u.nickname, u.email_notifications_enabled, u.is_premium, u.premium_expires_at, u.toss_customer_key);
  return Number(info.lastInsertRowid);
}

export function seedSubscription(db: FakeD1, userId: number, overrides: Partial<{
  plan: string; status: string; auto_renew: number; toss_billing_key: string | null;
  kakao_sid: string | null; current_period_end: string; failed_charge_count: number;
}> = {}): number {
  const s = {
    plan: 'MONTHLY', status: 'ACTIVE', auto_renew: 1, toss_billing_key: 'billing-key-1',
    kakao_sid: null, current_period_end: '2026-07-29 00:00:00', failed_charge_count: 0,
    ...overrides,
  };
  const info = db.raw.prepare(
    `INSERT INTO subscriptions (user_id, plan, status, auto_renew, toss_billing_key, kakao_sid, current_period_end, failed_charge_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, s.plan, s.status, s.auto_renew, s.toss_billing_key, s.kakao_sid, s.current_period_end, s.failed_charge_count);
  return Number(info.lastInsertRowid);
}

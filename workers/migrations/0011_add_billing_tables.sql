-- Migration number: 0011 	 2026-07-19T00:00:00.000Z

-- 토스페이먼츠 결제 연동 — is_premium을 실제로 관리하는 만료일/구독/결제이력.
-- premium_expires_at이 NULL인 기존 계정(0010 마이그레이션 당시 is_premium=1로
-- 넘어온 "결제 이전부터 열려있던" 계정)은 결제 로직이 손대지 않는다 — 만료 스윕/갱신
-- 크론 모두 premium_expires_at IS NOT NULL 조건으로만 동작한다.
ALTER TABLE users ADD COLUMN premium_expires_at TEXT;

-- 토스 자동결제(빌링) API가 고객을 식별하는 데 쓰는 값. 결제를 한 번도 시도하지 않은
-- 사용자는 필요 없으므로 가입 시점이 아니라 첫 체크아웃 시점에 지연 생성한다.
ALTER TABLE users ADD COLUMN toss_customer_key TEXT;

-- 구독 한 건 = 결제 수단 하나. ONE_TIME도 auto_renew=0인 구독 행으로 취급해서
-- payments/크론 쿼리가 결제 방식별로 분기하지 않아도 되게 한다.
CREATE TABLE subscriptions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL CHECK (plan IN ('ONE_TIME', 'MONTHLY', 'ANNUAL')),
  status               TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CANCELED', 'PAST_DUE', 'EXPIRED')),
  auto_renew           INTEGER NOT NULL DEFAULT 0,
  toss_billing_key     TEXT, -- MONTHLY/ANNUAL만 사용
  current_period_end   TEXT NOT NULL,
  failed_charge_count  INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_renewal_sweep ON subscriptions(status, auto_renew, current_period_end);

-- 결제 시도/성공 이력. order_id는 체크아웃 생성 시점에 서버가 미리 발급해 저장해두고,
-- 토스 리다이렉트로 돌아온 값과 대조한다 — 금액은 절대 클라이언트/리다이렉트 파라미터를
-- 신뢰하지 않고 이 테이블에 서버가 먼저 적어둔 값과 비교한다.
CREATE TABLE payments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  INTEGER REFERENCES subscriptions(id),
  order_id         TEXT NOT NULL UNIQUE,
  payment_key      TEXT,
  plan             TEXT NOT NULL CHECK (plan IN ('ONE_TIME', 'MONTHLY', 'ANNUAL')),
  amount           INTEGER NOT NULL, -- KRW, 원 단위 정수
  status           TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
  failure_reason   TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at     TEXT
);

CREATE INDEX idx_payments_user_id_created_at ON payments(user_id, created_at);

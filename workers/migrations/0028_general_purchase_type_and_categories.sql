-- "구매 유형"과 "서비스 카테고리"를 분리한다.
-- ELECTRONICS(전자제품·보증기간)/ONLINE_ORDER(온라인주문·반품기한)는 하나의 GENERAL(일반 구매)로
-- 합친다 — warranty_months/return_deadline_days 두 필드 모두 그대로 남아있으니 일반 구매 항목이
-- 반품기한과 A/S 보증기간을 동시에 가질 수 있게 된다(purchase-logic.ts의 computeDeadlines 참고).
-- category는 이제 모든 구매 유형에 적용되고(이전엔 RECURRING_DELIVERY/SUBSCRIPTION 전용),
-- STREAMING -> ENTERTAINMENT로 이름을 바꾸고 AI/CREATOR_SUPPORT/CLOUD 3종을 추가한다.
-- SQLite는 기존 CHECK 제약을 ALTER로 바꿀 수 없어(0017/0020과 동일한 이유) 테이블을 재생성한다.

ALTER TABLE purchases RENAME TO purchases_old;

CREATE TABLE purchases (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION')),
  item_name            TEXT NOT NULL,
  base_date            TEXT NOT NULL,
  amount               REAL,
  memo                 TEXT,
  warranty_months      INTEGER,
  return_deadline_days INTEGER,
  interval_days        INTEGER,
  schedule_type        TEXT NOT NULL DEFAULT 'INTERVAL',
  fixed_day_of_month   INTEGER,
  last_delivered_date  TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_confirm_count INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  discontinued_at TEXT,
  category TEXT
    CHECK (category IS NULL OR category IN ('SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER')),
  brand TEXT,
  brand_domain TEXT,
  original_amount REAL,
  original_currency TEXT,
  exchange_rate REAL
);

INSERT INTO purchases (
  id, user_id, type, item_name, base_date, amount, memo, warranty_months,
  return_deadline_days, interval_days, schedule_type, fixed_day_of_month,
  last_delivered_date, created_at, updated_at, delivery_confirm_count, archived_at,
  discontinued_at, category, brand, brand_domain, original_amount, original_currency, exchange_rate
)
SELECT
  id, user_id,
  CASE WHEN type IN ('ELECTRONICS', 'ONLINE_ORDER') THEN 'GENERAL' ELSE type END,
  item_name, base_date, amount, memo, warranty_months,
  return_deadline_days, interval_days, schedule_type, fixed_day_of_month,
  last_delivered_date, created_at, updated_at, delivery_confirm_count, archived_at,
  discontinued_at,
  CASE WHEN category = 'STREAMING' THEN 'ENTERTAINMENT' ELSE category END,
  brand, brand_domain, original_amount, original_currency, exchange_rate
FROM purchases_old;

DROP TABLE purchases_old;

CREATE INDEX idx_purchases_user_id ON purchases(user_id);

ALTER TABLE pending_purchases RENAME TO pending_purchases_old;

CREATE TABLE pending_purchases (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source                 TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'image')),
  item_name              TEXT,
  order_date             TEXT,
  expected_delivery_date TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'ignored')),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL DEFAULT 'GENERAL'
    CHECK (type IN ('GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION')),
  return_deadline_days INTEGER,
  return_deadline_estimated INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER,
  schedule_type TEXT NOT NULL DEFAULT 'INTERVAL',
  fixed_day_of_month INTEGER,
  schedule_estimated INTEGER NOT NULL DEFAULT 0,
  amount INTEGER,
  category TEXT
    CHECK (category IS NULL OR category IN ('SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER')),
  matched_purchase_id INTEGER,
  previous_amount INTEGER,
  brand TEXT,
  brand_domain TEXT,
  original_amount REAL,
  original_currency TEXT,
  exchange_rate REAL,
  -- 신규 컬럼 — AI가 GENERAL 항목을 전자제품으로 판단했을 때만 기본 보증기간(12개월)을 채운다.
  -- 기존 대기 항목(수명이 짧음)은 그냥 NULL로 남는다.
  warranty_months INTEGER
);

INSERT INTO pending_purchases (
  id, user_id, source, item_name, order_date, expected_delivery_date, status, created_at,
  type, return_deadline_days, return_deadline_estimated, interval_days, schedule_type,
  fixed_day_of_month, schedule_estimated, amount, category, matched_purchase_id, previous_amount,
  brand, brand_domain, original_amount, original_currency, exchange_rate
)
SELECT
  id, user_id, source, item_name, order_date, expected_delivery_date, status, created_at,
  CASE WHEN type IN ('ELECTRONICS', 'ONLINE_ORDER') THEN 'GENERAL' ELSE type END,
  return_deadline_days, return_deadline_estimated, interval_days, schedule_type,
  fixed_day_of_month, schedule_estimated, amount,
  CASE WHEN category = 'STREAMING' THEN 'ENTERTAINMENT' ELSE category END,
  matched_purchase_id, previous_amount,
  brand, brand_domain, original_amount, original_currency, exchange_rate
FROM pending_purchases_old;

DROP TABLE pending_purchases_old;

CREATE INDEX idx_pending_purchases_user_status ON pending_purchases(user_id, status);

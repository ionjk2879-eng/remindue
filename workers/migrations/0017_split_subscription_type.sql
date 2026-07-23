-- RECURRING_DELIVERY(정기배송·실물)와 SUBSCRIPTION(정기구독·디지털)을 별개 종류로 분리한다.
-- SQLite는 기존 CHECK 제약을 ALTER로 바꿀 수 없어 테이블을 재생성한다 — 컬럼 구성/순서는
-- 현재 스키마와 완전히 동일하게 유지하고 type CHECK에만 'SUBSCRIPTION'을 추가한다.
-- 기존 데이터는 전부 RECURRING_DELIVERY(정기배송)로 그대로 남는다 — 재분류 없이 값 범위만 넓힌다.

ALTER TABLE purchases RENAME TO purchases_old;

CREATE TABLE purchases (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY', 'SUBSCRIPTION')),
  item_name            TEXT NOT NULL,
  base_date            TEXT NOT NULL,
  amount               REAL,
  memo                 TEXT,
  warranty_months      INTEGER,
  return_deadline_days INTEGER,
  interval_days        INTEGER,
  last_delivered_date  TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_confirm_count INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  schedule_type TEXT NOT NULL DEFAULT 'INTERVAL',
  fixed_day_of_month INTEGER
);

INSERT INTO purchases (
  id, user_id, type, item_name, base_date, amount, memo, warranty_months,
  return_deadline_days, interval_days, last_delivered_date, created_at, updated_at,
  delivery_confirm_count, archived_at, schedule_type, fixed_day_of_month
)
SELECT
  id, user_id, type, item_name, base_date, amount, memo, warranty_months,
  return_deadline_days, interval_days, last_delivered_date, created_at, updated_at,
  delivery_confirm_count, archived_at, schedule_type, fixed_day_of_month
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
  type TEXT NOT NULL DEFAULT 'ONLINE_ORDER'
    CHECK (type IN ('ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY', 'SUBSCRIPTION')),
  return_deadline_days INTEGER,
  return_deadline_estimated INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER,
  schedule_type TEXT NOT NULL DEFAULT 'INTERVAL',
  fixed_day_of_month INTEGER
);

INSERT INTO pending_purchases (
  id, user_id, source, item_name, order_date, expected_delivery_date, status, created_at,
  type, return_deadline_days, return_deadline_estimated, interval_days, schedule_type, fixed_day_of_month
)
SELECT
  id, user_id, source, item_name, order_date, expected_delivery_date, status, created_at,
  type, return_deadline_days, return_deadline_estimated, interval_days, schedule_type, fixed_day_of_month
FROM pending_purchases_old;

DROP TABLE pending_purchases_old;

CREATE INDEX idx_pending_purchases_user_status ON pending_purchases(user_id, status);

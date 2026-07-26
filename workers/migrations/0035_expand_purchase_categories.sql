-- 6f4047c에서 AI 분류에 HAIR_BODY/SKINCARE/PET을 추가했지만, D1의 기존
-- CHECK 제약에는 반영하지 않아 해당 카테고리 메일이 계속 재시도되는 문제가 있었다.
-- SQLite는 CHECK 제약을 직접 변경할 수 없으므로 두 테이블을 재생성한다.

ALTER TABLE purchases RENAME TO purchases_old;

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION')),
  item_name TEXT NOT NULL,
  base_date TEXT NOT NULL,
  amount REAL,
  memo TEXT,
  warranty_months INTEGER,
  return_deadline_days INTEGER,
  interval_days INTEGER,
  schedule_type TEXT NOT NULL DEFAULT 'INTERVAL',
  fixed_day_of_month INTEGER,
  last_delivered_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_confirm_count INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  discontinued_at TEXT,
  discarded_at TEXT,
  category TEXT CHECK (category IS NULL OR category IN (
    'SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY',
    'SKINCARE', 'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER'
  )),
  brand TEXT,
  brand_domain TEXT,
  original_amount REAL,
  original_currency TEXT,
  exchange_rate REAL,
  expected_delivery_date TEXT,
  arrival_check_snoozed_until TEXT,
  is_one_time INTEGER NOT NULL DEFAULT 0
);

INSERT INTO purchases (
  id, user_id, type, item_name, base_date, amount, memo, warranty_months,
  return_deadline_days, interval_days, schedule_type, fixed_day_of_month,
  last_delivered_date, created_at, updated_at, delivery_confirm_count,
  archived_at, discontinued_at, discarded_at, category, brand, brand_domain,
  original_amount, original_currency, exchange_rate, expected_delivery_date,
  arrival_check_snoozed_until, is_one_time
)
SELECT
  id, user_id, type, item_name, base_date, amount, memo, warranty_months,
  return_deadline_days, interval_days, schedule_type, fixed_day_of_month,
  last_delivered_date, created_at, updated_at, delivery_confirm_count,
  archived_at, discontinued_at, discarded_at, category, brand, brand_domain,
  original_amount, original_currency, exchange_rate, expected_delivery_date,
  arrival_check_snoozed_until, is_one_time
FROM purchases_old;
DROP TABLE purchases_old;
CREATE INDEX idx_purchases_user_id ON purchases(user_id);

ALTER TABLE pending_purchases RENAME TO pending_purchases_old;

CREATE TABLE pending_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'image')),
  item_name TEXT,
  order_date TEXT,
  expected_delivery_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'ignored')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  type TEXT NOT NULL DEFAULT 'GENERAL' CHECK (type IN ('GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION')),
  return_deadline_days INTEGER,
  return_deadline_estimated INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER,
  schedule_type TEXT NOT NULL DEFAULT 'INTERVAL',
  fixed_day_of_month INTEGER,
  schedule_estimated INTEGER NOT NULL DEFAULT 0,
  amount INTEGER,
  category TEXT CHECK (category IS NULL OR category IN (
    'SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY',
    'SKINCARE', 'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER'
  )),
  matched_purchase_id INTEGER,
  previous_amount INTEGER,
  brand TEXT,
  brand_domain TEXT,
  original_amount REAL,
  original_currency TEXT,
  exchange_rate REAL,
  warranty_months INTEGER
);

INSERT INTO pending_purchases (
  id, user_id, source, item_name, order_date, expected_delivery_date, status,
  created_at, type, return_deadline_days, return_deadline_estimated, interval_days,
  schedule_type, fixed_day_of_month, schedule_estimated, amount, category,
  matched_purchase_id, previous_amount, brand, brand_domain, original_amount,
  original_currency, exchange_rate, warranty_months
)
SELECT
  id, user_id, source, item_name, order_date, expected_delivery_date, status,
  created_at, type, return_deadline_days, return_deadline_estimated, interval_days,
  schedule_type, fixed_day_of_month, schedule_estimated, amount, category,
  matched_purchase_id, previous_amount, brand, brand_domain, original_amount,
  original_currency, exchange_rate, warranty_months
FROM pending_purchases_old;
DROP TABLE pending_purchases_old;
CREATE INDEX idx_pending_purchases_user_status ON pending_purchases(user_id, status);

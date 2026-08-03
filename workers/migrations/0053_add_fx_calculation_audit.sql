ALTER TABLE payment_history ADD COLUMN rate_source TEXT;
ALTER TABLE payment_history ADD COLUMN rate_date TEXT;
ALTER TABLE payment_history ADD COLUMN card_issuer TEXT;
ALTER TABLE payment_history ADD COLUMN card_brand TEXT;
ALTER TABLE payment_history ADD COLUMN formula_version TEXT;
ALTER TABLE payment_history ADD COLUMN used_fallback INTEGER NOT NULL DEFAULT 0;

CREATE TABLE fx_recalculation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PREVIEWING',
  total_count INTEGER NOT NULL DEFAULT 0,
  ready_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  applied_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE fx_recalculation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES fx_recalculation_jobs(id) ON DELETE CASCADE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  calculation_date TEXT NOT NULL,
  original_amount REAL NOT NULL,
  original_currency TEXT NOT NULL,
  before_amount INTEGER,
  before_exchange_rate REAL,
  proposed_amount INTEGER,
  proposed_exchange_rate REAL,
  rate_source TEXT,
  rate_date TEXT,
  card_issuer TEXT,
  card_brand TEXT,
  formula_version TEXT,
  used_fallback INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, purchase_id)
);

CREATE INDEX idx_fx_recalc_jobs_user ON fx_recalculation_jobs(user_id, created_at DESC);
CREATE INDEX idx_fx_recalc_items_job ON fx_recalculation_items(job_id, status);

CREATE TABLE fx_calculation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES fx_recalculation_jobs(id) ON DELETE SET NULL,
  calculation_date TEXT NOT NULL,
  original_amount REAL NOT NULL,
  original_currency TEXT NOT NULL,
  previous_amount INTEGER,
  calculated_amount INTEGER NOT NULL,
  exchange_rate REAL NOT NULL,
  rate_source TEXT NOT NULL,
  rate_date TEXT NOT NULL,
  card_issuer TEXT,
  card_brand TEXT,
  formula_version TEXT NOT NULL,
  used_fallback INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_fx_calculation_history_purchase ON fx_calculation_history(purchase_id, created_at DESC);

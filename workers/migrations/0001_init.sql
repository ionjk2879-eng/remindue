-- Initial schema: users, purchases
-- Ported from Spring Boot entities (backend/src/main/java/com/remindue/domain/**)

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nickname      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE purchases (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY')),
  item_name            TEXT NOT NULL,
  base_date            TEXT NOT NULL, -- yyyy-MM-dd
  amount               REAL,
  memo                 TEXT,
  warranty_months      INTEGER, -- ELECTRONICS
  return_deadline_days INTEGER, -- ONLINE_ORDER (default 7)
  interval_days        INTEGER, -- RECURRING_DELIVERY (default 30)
  last_delivered_date  TEXT,    -- RECURRING_DELIVERY
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_purchases_user_id ON purchases(user_id);

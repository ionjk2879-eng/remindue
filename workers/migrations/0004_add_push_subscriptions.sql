-- Migration number: 0004 	 2026-07-18T00:00:00.000Z

-- Web Push 구독 정보. endpoint가 브라우저/기기별 구독을 고유하게 식별한다.
CREATE TABLE push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

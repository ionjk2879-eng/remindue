-- 같은 날짜에 묶인 배송 도착/정기 유지 확인을 한 번에 처리하기 위한 1회성 배치 토큰.
CREATE TABLE push_action_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('ARRIVAL', 'RECURRING')),
  purchase_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE INDEX idx_push_action_batches_token ON push_action_batches(token);

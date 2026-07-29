-- Migration number: 0044  2026-07-29T00:00:00.000Z
-- Android FCM 네이티브 푸시 토큰 저장 테이블.
-- WebPush(VAPID)는 push_subscriptions에, FCM은 여기에 별도로 관리한다.
CREATE TABLE native_push_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, token)
);

CREATE INDEX idx_native_push_tokens_user_id ON native_push_tokens(user_id);

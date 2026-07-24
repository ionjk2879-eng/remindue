-- 푸시 알림의 액션 버튼("유지하기"/"나중에")용 1회성 토큰. 서비스워커는 로그인 세션(accessToken)에
-- 접근할 수 없어서, 인증 없이도 "이 특정 알림에서 나온 요청"임을 증명할 추측 불가능한 토큰을
-- 대신 쓴다(push_subscriptions.endpoint를 소유 증명으로 쓰는 /push/unsubscribe와 같은 패턴).
CREATE TABLE push_action_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE INDEX idx_push_action_tokens_token ON push_action_tokens(token);

-- 버그 수정: migrations/0026이 push_action_tokens.purchase_id를 "REFERENCES purchases(id)"로
-- 만들었는데, 그 뒤 0028이 purchases 테이블을 재생성하면서(ALTER TABLE purchases RENAME TO
-- purchases_old → 새 purchases 생성 → 데이터 복사 → purchases_old DROP) SQLite가 RENAME 시점에
-- push_action_tokens의 FK 정의를 자동으로 "REFERENCES purchases_old(id)"로 고쳐썼다(legacy_alter_table
-- OFF일 때의 표준 동작). 그 뒤 purchases_old가 DROP돼서, 그 순간부터 push_action_tokens에 대한 모든
-- INSERT(FK 대상 테이블이 없음)가 실패해왔다 — "유지하기"/"나중에" 푸시 액션 버튼(action-tokens.ts)
-- 전체가 이 시점부터 조용히 깨져 있었다는 뜻. 토큰은 1회용·24시간 만료라 보존할 데이터가 없으므로
-- 데이터 이관 없이 그냥 재생성한다.
DROP TABLE push_action_tokens;

CREATE TABLE push_action_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);

CREATE INDEX idx_push_action_tokens_token ON push_action_tokens(token);

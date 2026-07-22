-- Migration number: 0014 	 2026-07-22T13:12:08.000Z

-- 사용자 피드백/문의 게시판 — 전체 공개(다른 사용자 글도 모두 보인다). 답글은 글쓴이 본인 또는
-- 운영자(Env.ADMIN_EMAIL과 이메일이 일치하는 사용자)만 남길 수 있다(routes/feedback.ts에서 검사).
CREATE TABLE feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('BUG', 'FEATURE_REQUEST', 'QUESTION', 'OTHER')),
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_feedback_created_at ON feedback(created_at);
CREATE INDEX idx_feedback_user_id ON feedback(user_id);

-- is_admin만으로 글쓴이 답글과 운영자 답글을 구분한다 — 이 스레드에는 글쓴이 본인과 운영자
-- 둘만 쓸 수 있으므로(POST /:id/replies의 권한 검사), is_admin=0은 항상 글쓴이 답글이다.
CREATE TABLE feedback_replies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_feedback_replies_feedback_id ON feedback_replies(feedback_id);

-- 로그인 브루트포스/가입 스팸 방지용 시도 횟수 추적. identifier는 용도별로 접두사를 붙여
-- 구분한다(예: "login:email:a@b.com", "login:ip:1.2.3.4", "signup:ip:1.2.3.4").
CREATE TABLE rate_limit_attempts (
  identifier TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT
);

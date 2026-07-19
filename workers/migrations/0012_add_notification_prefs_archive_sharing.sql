-- Migration number: 0012 	 2026-07-19T03:00:00.000Z

-- 커스텀 알림 시점(프리미엄) — D-day 다이제스트가 몇 일 전에 알릴지 콤마로 구분된 정수 목록.
-- 무료 플랜은 항상 이 컬럼과 무관하게 고정 "7,3,1,0"을 쓰고(라우트에서 강제), 프리미엄만
-- 실제로 바꿀 수 있다. 기본값 자체를 무료 플랜 고정값과 같게 둬서, 아직 한 번도 안 바꾼
-- 프리미엄 사용자도 기존 알림 리듬이 그대로 유지된다.
ALTER TABLE users ADD COLUMN notification_days TEXT NOT NULL DEFAULT '7,3,1,0';

-- 이력 보관(아카이브, 프리미엄) — 삭제 대신 이 값을 채워서 "더는 안 챙겨도 되지만 기록은
-- 남기고 싶은" 항목을 표시한다. NULL이면 활성 항목. dDay 계산 자체는 그대로 할 수 있지만
-- 알림/목록 조회 쿼리는 이 컬럼으로 걸러서 보관함과 분리한다.
ALTER TABLE purchases ADD COLUMN archived_at TEXT;

-- 가족/구성원 공유(프리미엄) — 구독자(owner)가 이메일로 초대하면 pending으로 생기고,
-- 초대받은 사람이 로그인해서 수락하면 accepted로 바뀐다. 소유자당 같은 이메일 중복 초대를
-- 막기 위해 (owner_user_id, shared_with_email)에 유니크를 건다.
CREATE TABLE shared_access (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_email  TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at        TEXT,
  UNIQUE (owner_user_id, shared_with_email)
);

CREATE INDEX idx_shared_access_owner ON shared_access(owner_user_id);
CREATE INDEX idx_shared_access_shared_with_email ON shared_access(shared_with_email);

-- Migration number: 0005 	 2026-07-18T00:00:00.000Z

-- 이메일 포워딩으로 온라인 주문 확인 메일을 자동 등록하기 위한 사용자별 고유 수신 토큰.
-- add-{forwarding_token}@{도메인}으로 온 메일을 이 값으로 사용자를 식별한다.
-- 기존 유저는 NULL로 추가된 뒤 바로 랜덤 값으로 백필하고, SQLite는 ALTER TABLE로 컬럼에
-- UNIQUE를 못 걸기 때문에 별도 UNIQUE 인덱스로 유일성을 보장한다.
ALTER TABLE users ADD COLUMN forwarding_token TEXT;

UPDATE users
   SET forwarding_token = lower(hex(randomblob(8)))
 WHERE forwarding_token IS NULL;

CREATE UNIQUE INDEX idx_users_forwarding_token ON users(forwarding_token);

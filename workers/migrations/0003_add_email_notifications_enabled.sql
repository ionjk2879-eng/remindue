-- Migration number: 0003 	 2026-07-18T00:00:00.000Z

-- 사용자별 이메일 알림(매일 D-day 다이제스트) on/off 플래그. 기본값 켜짐.
ALTER TABLE users ADD COLUMN email_notifications_enabled INTEGER NOT NULL DEFAULT 1;

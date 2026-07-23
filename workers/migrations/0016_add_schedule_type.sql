-- 정기배송/구독 스케줄 방식 추가: INTERVAL(N일마다, 기존 방식)과 FIXED_DAY(매월 특정일) 지원.
-- 기존 행은 모두 INTERVAL로 취급 — DEFAULT가 'INTERVAL'이라 마이그레이션 후에도 동작 그대로 유지됨.

ALTER TABLE purchases ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'INTERVAL';
ALTER TABLE purchases ADD COLUMN fixed_day_of_month INTEGER;

ALTER TABLE pending_purchases ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'INTERVAL';
ALTER TABLE pending_purchases ADD COLUMN fixed_day_of_month INTEGER;

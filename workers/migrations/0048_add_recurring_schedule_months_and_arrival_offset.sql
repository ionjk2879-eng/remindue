-- 정기배송·구독의 FIXED_DAY 스케줄을 "매월"에서 "매 N개월"로 일반화(fixed_day_interval_months,
-- 기본 1 = 기존 매월 동작과 완전히 동일)하고, RECURRING_DELIVERY 전용으로 결제일과 도착예정일을
-- 구분하기 위한 arrival_offset_days(결제일로부터 보통 영업일 며칠 후 도착하는지, 미입력이면 NULL
-- 이라 도착예정 표시 자체를 안 함)를 추가한다. 0016_add_schedule_type.sql과 같은 이유로 purchases/
-- pending_purchases 두 테이블 모두에 추가한다.

ALTER TABLE purchases ADD COLUMN fixed_day_interval_months INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchases ADD COLUMN arrival_offset_days INTEGER;

ALTER TABLE pending_purchases ADD COLUMN fixed_day_interval_months INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pending_purchases ADD COLUMN arrival_offset_days INTEGER;

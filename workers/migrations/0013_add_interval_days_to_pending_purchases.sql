-- Migration number: 0013 	 2026-07-22T00:00:00.000Z

-- 정기배송 구독확인 메일에서 추출한 배송 주기(일수)를 확인 대기 항목에도 저장한다.
-- RECURRING_DELIVERY로 추정된 항목에만 채워지고, 다른 종류는 NULL.
ALTER TABLE pending_purchases ADD COLUMN interval_days INTEGER;

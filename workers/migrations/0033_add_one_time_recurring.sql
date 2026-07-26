-- 정기배송·정기구독을 한 번만 사용해 봐도 항목은 목록에 남길 수 있도록 한다.
-- 이후 회차의 유지 확인·예상 지출만 제외하며, discontinued_at(사용 중단)과는 다른 개념이다.
ALTER TABLE purchases ADD COLUMN is_one_time INTEGER NOT NULL DEFAULT 0;

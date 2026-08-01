-- "유지하기"로 회차가 갱신될 때마다(이메일 없이도) 직전 회차 대비 금액 변동을 감지하기 위한 컬럼.
-- 매달이 아니라 그 항목의 "직전으로 기록된 회차"와 비교하므로 격월/분기 등 주기가 1개월이 아니어도
-- 정확하다. NULL이면 변동 없음(또는 아직 비교할 이전 회차가 없음) — recurring-fx.ts 참고.
ALTER TABLE purchases ADD COLUMN price_change_previous_amount INTEGER;

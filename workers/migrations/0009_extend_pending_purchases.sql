-- Migration number: 0009 	 2026-07-19T00:00:00.000Z

-- 확인 대기 항목에도 AI가 추정한 종류(purchases.type과 동일한 3종)를 함께 저장해서, 사용자가
-- "확인 후 등록" 화면에서 자유롭게 종류를 바꿀 수 있게 한다. 반품기한도 절대 날짜 대신
-- "일수 + 명시 여부"로 저장해서, 메일에 명시되지 않았을 때 전자상거래법 최소 기준(7일)으로
-- 추정했다는 걸 확인 대기 화면에서 경고로 보여줄 수 있게 한다.
ALTER TABLE pending_purchases ADD COLUMN type TEXT NOT NULL DEFAULT 'ONLINE_ORDER'
  CHECK (type IN ('ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY'));
ALTER TABLE pending_purchases ADD COLUMN return_deadline_days INTEGER;
ALTER TABLE pending_purchases ADD COLUMN return_deadline_estimated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pending_purchases DROP COLUMN return_deadline;

-- Migration number: 0002 	 2026-07-17T13:55:08.903Z

-- RECURRING_DELIVERY 전용: "이번 회차 수령 확인"을 누른 횟수. 계산상 회차(deliveryRound)와
-- 비교해서 확인을 놓친 배송이 있는지 안내하는 데 쓴다.
ALTER TABLE purchases ADD COLUMN delivery_confirm_count INTEGER NOT NULL DEFAULT 0;

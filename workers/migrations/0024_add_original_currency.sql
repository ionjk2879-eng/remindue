-- 해외 통화 결제 금액 원문 보존 + 결제일 기준 환율. amount는 여전히 이 환율로 환산된 원화 정수값이다.
-- 원화 결제(대부분)면 셋 다 NULL — 기존 동작과 완전히 동일하다.
ALTER TABLE purchases ADD COLUMN original_amount REAL;
ALTER TABLE purchases ADD COLUMN original_currency TEXT;
ALTER TABLE purchases ADD COLUMN exchange_rate REAL;
ALTER TABLE pending_purchases ADD COLUMN original_amount REAL;
ALTER TABLE pending_purchases ADD COLUMN original_currency TEXT;
ALTER TABLE pending_purchases ADD COLUMN exchange_rate REAL;

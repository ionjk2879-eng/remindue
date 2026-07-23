-- 이메일로 들어온 "구독/배송 갱신" 확인 메일이 이미 등록된 항목과 같은 상품명이면서 금액이
-- 달라졌을 때 "가격 인상 감지"로 표시할 수 있게, 매칭된 기존 항목과 그때의 이전 금액을 남긴다.
-- matched_purchase_id가 NULL이면 일반적인(가격 변동 없는/신규) 확인 대기 항목이다.
ALTER TABLE pending_purchases ADD COLUMN matched_purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL;
ALTER TABLE pending_purchases ADD COLUMN previous_amount INTEGER;

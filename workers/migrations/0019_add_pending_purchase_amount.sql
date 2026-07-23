-- AI가 이메일에서 금액(원)도 함께 추출해서 확인 대기 화면에 보여주고, "등록" 클릭 시
-- purchases.amount(이미 존재하는 컬럼)로 그대로 넘길 수 있게 한다.
ALTER TABLE pending_purchases ADD COLUMN amount INTEGER;

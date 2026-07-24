-- 브랜드명(판매처) — AI 이메일 추출 시 자동 감지, 수동 등록은 null.
ALTER TABLE purchases ADD COLUMN brand TEXT;
ALTER TABLE pending_purchases ADD COLUMN brand TEXT;

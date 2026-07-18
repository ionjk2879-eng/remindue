-- Migration number: 0007 	 2026-07-18T00:00:00.000Z

-- 개인정보 보호 강화: pending_purchases에 원본 메일 발췌(raw_excerpt)를 더 이상 저장하지
-- 않는다 — email-intake.ts는 이제 Claude가 추출한 구조화 필드(상품명/날짜)만 INSERT한다.
-- 이미 저장돼 있던 원본 발췌도 이 컬럼과 함께 완전히 제거된다.
ALTER TABLE pending_purchases DROP COLUMN raw_excerpt;

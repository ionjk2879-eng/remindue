-- 무료 플랜 이메일 추출 월별 상한 추적
-- free_email_month: 현재 집계 중인 월(YYYYMM). NULL이면 이번 달 첫 처리 전.
-- free_email_count: 해당 월의 처리 횟수. free_email_month가 현재 달이 아니면 만료된 값이다.
ALTER TABLE users ADD COLUMN free_email_month TEXT;
ALTER TABLE users ADD COLUMN free_email_count INTEGER NOT NULL DEFAULT 0;

-- Migration number: 0046  2026-07-29T10:00:00.000Z
-- 카카오페이 정기결제 지원 — 토스의 toss_billing_key와 같은 역할을 하는 sid(정기결제 ID)를 저장한다.
ALTER TABLE subscriptions ADD COLUMN kakao_sid TEXT;

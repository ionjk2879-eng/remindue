-- Migration number: 0045  2026-07-29T09:00:00.000Z
-- 결제 대행사(PG)가 토스 하나뿐이었으나 카카오페이가 추가되어, 어느 PG로 결제됐는지 구분한다.
-- 기존 행은 전부 토스로 결제된 것이므로 기본값 TOSS로 채운다.
ALTER TABLE payments ADD COLUMN pg_provider TEXT NOT NULL DEFAULT 'TOSS' CHECK (pg_provider IN ('TOSS', 'KAKAOPAY'));

-- Migration number: 0010 	 2026-07-19T00:00:00.000Z

-- 프리미엄 알림 기능(정기배송 놓친 배송 감지 + 주간 요약)을 위한 플래그. 실제 결제 연동 전까지는
-- 모두에게 무료로 열어두기 위해 기본값 1(true)로 둔다 — 나중에 결제를 붙이면 이 컬럼만으로
-- 기능 접근을 제어할 수 있다.
ALTER TABLE users ADD COLUMN is_premium INTEGER NOT NULL DEFAULT 1;

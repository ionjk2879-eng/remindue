-- Migration number: 0015 	 2026-07-22T13:34:26.000Z

-- 신규 가입자 온보딩 — 3단계 안내를 완료하거나 건너뛰면 1로 저장해서 다시 안 뜨게 한다.
-- 기존 계정은 전부 기본값 0으로 시작하지만, 프론트(DashboardPage)에서 "등록된 항목이 0개일
-- 때만" 이 값을 보고 온보딩을 띄우므로 이미 항목을 등록해둔 기존 사용자에게는 사실상 뜨지 않는다.
ALTER TABLE users ADD COLUMN has_seen_onboarding INTEGER NOT NULL DEFAULT 0;

-- RECURRING_DELIVERY 전용: 스토어의 실제 배송 사이클은 구매일이 아니라 "최초 도착(예정)일"을
-- 기준으로 굴러간다(사용자가 가입한 시점과 그 상품의 배송 사이클 위상이 무관하기 때문 — 첫 배송이
-- 반 주기 뒤에 오든 3주 뒤에 오든, 그 이후 회차는 항상 그 첫 배송일 기준으로 반복된다). base_date는
-- 계속 "구매일"(기록용)로 남기고, 이 컬럼이 스케줄 계산의 기준점이 된다 — purchase-logic.ts의
-- computeDeadlines가 RECURRING_DELIVERY에 한해 expected_delivery_date ?? base_date를 앵커로 쓴다.
-- 기존 행은 NULL로 남아 지금까지처럼 base_date가 그대로 앵커 역할을 계속한다(동작 변화 없음).
-- SUBSCRIPTION은 이 컬럼을 쓰지 않는다(디지털 결제라 배송이라는 개념 자체가 없고, base_date 기준
-- 고정 스케줄을 그대로 유지한다).
ALTER TABLE purchases ADD COLUMN expected_delivery_date TEXT;

-- "오늘 물건 받으셨나요?" 도착 확인 알림(arrival-confirm.ts)의 재발송 상태. "아직요"를 누르면
-- 내일 날짜로 채워서 하루 뒤에 다시 물어보고, 확인이 끝나면(받았어요) NULL로 되돌린다.
ALTER TABLE purchases ADD COLUMN arrival_check_snoozed_until TEXT;

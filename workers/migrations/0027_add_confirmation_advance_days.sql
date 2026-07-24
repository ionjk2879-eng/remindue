-- "확인이 필요한 항목" 예고 알림이 결제/배송 며칠 전에 올지(기본 3일). 무료는 항상 3일 고정,
-- 프리미엄만 바꿀 수 있다(notification-prefs.ts의 effectiveConfirmationAdvanceDays 참고).
ALTER TABLE users ADD COLUMN confirmation_advance_days INTEGER NOT NULL DEFAULT 3;

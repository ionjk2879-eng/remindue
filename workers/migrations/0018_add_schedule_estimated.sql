-- 정기배송/구독 주기가 원본(이메일/이미지)에 구체적으로 명시되지 않아 30일 기본값으로
-- 추정해 채웠는지 표시한다. return_deadline_estimated와 같은 패턴 — 확인 대기 화면에서
-- "정확한 주기를 확인해주세요" 경고를 보여줄 때 쓴다.
ALTER TABLE pending_purchases ADD COLUMN schedule_estimated INTEGER NOT NULL DEFAULT 0;

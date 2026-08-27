-- 이메일로 재구독 확인 메일이 왔는데 같은 이름의 "지난 항목"(유지 안 함/미확인 만료/삭제/
-- 1회성 만료)이 있으면, 사용자가 "재구독인가요?"에 예라고 답했을 때 회차를 이어붙일 수 있게
-- 그 지난 항목의 id를 남긴다. NULL이면 매칭된 지난 항목이 없다는 뜻.
ALTER TABLE pending_purchases ADD COLUMN matched_past_purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL;

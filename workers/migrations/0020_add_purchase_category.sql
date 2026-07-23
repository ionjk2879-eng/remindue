-- 정기배송/정기구독 항목에 지출 카테고리를 붙여서 대시보드에서 "카테고리별 분석"(영상/쇼핑/
-- 식품/소프트웨어/기타 개수)을 보여줄 수 있게 한다. ELECTRONICS/ONLINE_ORDER는 의미가 없으므로
-- NULL로 둔다 — CHECK는 NULL을 항상 통과시키므로 별도 분기 없이 그대로 허용된다.
ALTER TABLE purchases ADD COLUMN category TEXT
  CHECK (category IS NULL OR category IN ('STREAMING', 'SHOPPING', 'FOOD', 'SOFTWARE', 'OTHER'));

-- AI가 이메일에서 카테고리도 함께 추정해서 확인 대기 화면에 프리필할 수 있게 pending_purchases에도 둔다.
ALTER TABLE pending_purchases ADD COLUMN category TEXT
  CHECK (category IS NULL OR category IN ('STREAMING', 'SHOPPING', 'FOOD', 'SOFTWARE', 'OTHER'));

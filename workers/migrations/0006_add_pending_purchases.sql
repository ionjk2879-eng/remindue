-- Migration number: 0006 	 2026-07-18T00:00:00.000Z

-- 이메일(추후 이미지 OCR도 같은 패턴 재사용 가능하도록 source 컬럼을 둠)로 자동 추출된
-- "확인 대기" 항목. AI가 스팸/무관 메일을 잘못 해석할 수 있으니 바로 purchases에 넣지 않고
-- 사용자가 대시보드에서 확인 후 직접 등록하거나 무시하게 한다.
CREATE TABLE pending_purchases (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source                 TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'image')),
  item_name              TEXT,
  order_date             TEXT, -- yyyy-MM-dd, AI가 추출(불확실하면 NULL)
  return_deadline        TEXT, -- yyyy-MM-dd, 메일에 명시된 반품기한(없으면 NULL)
  expected_delivery_date TEXT, -- yyyy-MM-dd, 예상 배송일(없으면 NULL)
  raw_excerpt            TEXT, -- 원문 일부(사용자가 맥락 확인할 수 있도록 제목+본문 앞부분)
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'ignored')),
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pending_purchases_user_status ON pending_purchases(user_id, status);

-- 정기구독/배송 항목이 회차별로 실제 얼마에 확정됐는지 남기는 이력. purchases.amount/exchange_rate는
-- 컬럼이 하나뿐이라 확인할 때마다 덮어써지고, 월별/연간 지출 집계는 그 "현재 값"을 모든 달에 소급
-- 적용해왔다(해외 정기결제처럼 환율이 매달 바뀌는 항목은 지난 달 지출도 최근 환율로 잘못 보였다).
-- 회차(cycle_date)마다 한 행씩 남겨 실제 그 시점 금액을 나중에도 그대로 조회할 수 있게 한다.
CREATE TABLE payment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  cycle_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  original_amount REAL,
  original_currency TEXT,
  exchange_rate REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(purchase_id, cycle_date)
);

CREATE INDEX idx_payment_history_purchase_id ON payment_history(purchase_id);

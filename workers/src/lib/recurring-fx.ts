import type { FxCardBrand, FxCardIssuer } from './fx-card';
import type { PaymentHistoryEntry, PurchaseRow } from '../types';
import { computeDDay, computeDeadline, computePreviousScheduleDeadline } from './purchase-logic';
import { convertToKrw } from './pending-purchase-intake';

/**
 * 유지 확인한 회차의 결제일. computeDeadline()의 "다음 회차"가 아직 지나지 않았다면(오늘 포함 —
 * 사전 알림(D-3 등)에서 미리 "유지하기"를 누른 경우도 포함) 그 회차 날짜를 그대로 쓴다. 아직
 * 오지 않은 날짜라 Frankfurter에 데이터가 없으면 convertToKrw가 알아서 최신 환율로 폴백한다.
 * 반대로 이미 결제일이 지나 다음 회차로 넘어간 뒤 뒤늦게 확인한 경우에만 바로 직전 회차의
 * 날짜를 쓴다 — "next === 오늘"만 확인하던 예전 버전은 사전 확인 케이스를 "뒤늦게 확인"으로
 * 오판해서 직전(지난) 회차의 환율을 저장하는 버그가 있었다.
 */
function confirmedScheduleDate(row: PurchaseRow): string {
  const next = computeDeadline(row).deadline;
  if (computeDDay(next) >= 0) return next;
  return computePreviousScheduleDeadline(row) ?? next;
}

/**
 * "유지하기"로 확인된(또는 실제 결제일에 도달한) 회차 하나를 확정 처리한다.
 * 1) 외화 결제면 최초 등록 때 저장한 원금·통화는 유지하고, 이번 회차 결제일의 환율로
 *    purchases.amount/exchange_rate를 갱신한다(조회 실패 시 기존 금액 보존).
 * 2) 그렇게 확정된(원화 결제면 기존 그대로인) 금액을 payment_history에 회차별로 남긴다 —
 *    purchases.amount는 컬럼이 하나뿐이라 다음 회차 확인 때 덮어써지므로, "그 달에 실제로
 *    얼마였는지"를 나중에도 조회하려면 회차마다 별도 행이 있어야 한다. 같은 회차(purchase_id +
 *    cycle_date)를 여러 번 확인해도(사전 확인 후 실제 결제일에 재동기화 등) upsert로 갱신될
 *    뿐 중복 행이 쌓이지 않는다.
 */
export async function recordConfirmedPaymentCycle(db: D1Database, row: PurchaseRow, eximApiKey?: string): Promise<void> {
  const cycleDate = confirmedScheduleDate(row);
  let amount = row.amount;
  let exchangeRate = row.exchange_rate;

  if (row.original_currency && row.original_amount !== null) {
    const user = await db.prepare('SELECT fx_card_issuer, fx_card_brand FROM users WHERE id = ?')
      .bind(row.user_id)
      .first<{ fx_card_issuer: string | null; fx_card_brand: string | null }>();
    const converted = await convertToKrw(
      row.original_currency,
      row.original_amount,
      cycleDate,
      (user?.fx_card_issuer as FxCardIssuer | null) ?? null,
      (user?.fx_card_brand as FxCardBrand | null) ?? null,
      eximApiKey
    );
    if (converted) {
      amount = converted.amountKrw;
      exchangeRate = converted.rate;
      await db.prepare(
        `UPDATE purchases
            SET amount = ?, exchange_rate = ?, updated_at = datetime('now')
          WHERE id = ?`
      )
        .bind(amount, exchangeRate, row.id)
        .run();
    }
  }

  if (amount === null) return;
  await db.prepare(
    `INSERT INTO payment_history (purchase_id, cycle_date, amount, original_amount, original_currency, exchange_rate)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(purchase_id, cycle_date) DO UPDATE SET
       amount = excluded.amount,
       original_amount = excluded.original_amount,
       original_currency = excluded.original_currency,
       exchange_rate = excluded.exchange_rate`
  )
    .bind(row.id, cycleDate, amount, row.original_amount, row.original_currency, exchangeRate)
    .run();
}

/** ?scope=spend 조회용 — 여러 항목의 회차별 결제 이력을 한 번에 묶어서 가져온다. */
export async function getPaymentHistoryByPurchaseIds(
  db: D1Database,
  purchaseIds: number[]
): Promise<Map<number, PaymentHistoryEntry[]>> {
  const map = new Map<number, PaymentHistoryEntry[]>();
  if (purchaseIds.length === 0) return map;

  const { results } = await db
    .prepare(
      `SELECT purchase_id, cycle_date, amount FROM payment_history
        WHERE purchase_id IN (${purchaseIds.map(() => '?').join(',')})
        ORDER BY cycle_date ASC`
    )
    .bind(...purchaseIds)
    .all<{ purchase_id: number; cycle_date: string; amount: number }>();

  for (const row of results) {
    const list = map.get(row.purchase_id) ?? [];
    list.push({ cycleDate: row.cycle_date, amount: row.amount });
    map.set(row.purchase_id, list);
  }
  return map;
}

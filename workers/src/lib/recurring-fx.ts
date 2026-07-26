import type { PurchaseRow } from '../types';
import { computeDeadline, computePreviousScheduleDeadline } from './purchase-logic';
import { convertToKrw } from './pending-purchase-intake';
import { todayDateOnly } from './date';

/** 유지 확인한 회차의 결제일. 늦게 확인하면 바로 직전 회차의 날짜를 사용한다. */
function confirmedScheduleDate(row: PurchaseRow): string {
  const next = computeDeadline(row).deadline;
  if (next === todayDateOnly()) return next;
  return computePreviousScheduleDeadline(row) ?? next;
}

/**
 * 최초 등록 때 저장한 외화 원금·통화는 유지하고, "유지하기"를 누른 회차 결제일의
 * 환율로 원화 금액과 적용 환율만 갱신한다. 조회 실패 시 기존 금액을 보존한다.
 */
export async function refreshRecurringFxOnConfirmation(db: D1Database, row: PurchaseRow): Promise<void> {
  if (!row.original_currency || row.original_amount === null) return;
  const converted = await convertToKrw(row.original_currency, row.original_amount, confirmedScheduleDate(row));
  if (!converted) return;

  await db.prepare(
    `UPDATE purchases
        SET amount = ?, exchange_rate = ?, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(converted.amountKrw, converted.rate, row.id)
    .run();
}

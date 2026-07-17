import { computeDDay, computeDeadline } from './purchase-logic';
import type { PurchaseResponse, PurchaseRow } from '../types';

export function toPurchaseResponse(row: PurchaseRow): PurchaseResponse {
  const deadline = computeDeadline(row);
  return {
    id: row.id,
    type: row.type,
    itemName: row.item_name,
    baseDate: row.base_date,
    amount: row.amount,
    memo: row.memo,
    warrantyMonths: row.warranty_months,
    returnDeadlineDays: row.return_deadline_days,
    intervalDays: row.interval_days,
    lastDeliveredDate: row.last_delivered_date,
    deadline,
    dDay: computeDDay(deadline),
    createdAt: row.created_at,
  };
}

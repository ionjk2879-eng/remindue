import { computeDDay, computeDeadline } from './purchase-logic';
import type { PendingPurchaseResponse, PendingPurchaseRow, PurchaseResponse, PurchaseRow } from '../types';

export function toPurchaseResponse(row: PurchaseRow): PurchaseResponse {
  const { deadline, deliveryRound } = computeDeadline(row);
  const dDay = computeDDay(deadline);

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
    scheduleType: row.schedule_type,
    fixedDayOfMonth: row.fixed_day_of_month,
    lastDeliveredDate: row.last_delivered_date,
    deadline,
    dDay,
    deliveryRound,
    archivedAt: row.archived_at,
    category: row.category,
    deliveryConfirmCount: row.delivery_confirm_count,
    createdAt: row.created_at,
  };
}

export function toPendingPurchaseResponse(row: PendingPurchaseRow): PendingPurchaseResponse {
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    itemName: row.item_name,
    orderDate: row.order_date,
    expectedDeliveryDate: row.expected_delivery_date,
    returnDeadlineDays: row.return_deadline_days,
    returnDeadlineEstimated: row.return_deadline_estimated === 1,
    intervalDays: row.interval_days,
    scheduleType: row.schedule_type,
    fixedDayOfMonth: row.fixed_day_of_month,
    scheduleEstimated: row.schedule_estimated === 1,
    amount: row.amount,
    category: row.category,
    matchedPurchaseId: row.matched_purchase_id,
    previousAmount: row.previous_amount,
    status: row.status,
    createdAt: row.created_at,
  };
}

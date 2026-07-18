import { computeDDay, computeDeadline } from './purchase-logic';
import type { PendingPurchaseResponse, PendingPurchaseRow, PurchaseResponse, PurchaseRow } from '../types';

export function toPurchaseResponse(row: PurchaseRow): PurchaseResponse {
  const { deadline, deliveryRound } = computeDeadline(row);

  // deliveryRound가 null이면(정기배송이 아니면) 회차 개념 자체가 없으므로 missedConfirmations도 null.
  const missedConfirmations = deliveryRound === null ? null : Math.max(0, deliveryRound - row.delivery_confirm_count);

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
    deliveryRound,
    missedConfirmations,
    createdAt: row.created_at,
  };
}

export function toPendingPurchaseResponse(row: PendingPurchaseRow): PendingPurchaseResponse {
  return {
    id: row.id,
    source: row.source,
    itemName: row.item_name,
    orderDate: row.order_date,
    returnDeadline: row.return_deadline,
    expectedDeliveryDate: row.expected_delivery_date,
    rawExcerpt: row.raw_excerpt,
    status: row.status,
    createdAt: row.created_at,
  };
}

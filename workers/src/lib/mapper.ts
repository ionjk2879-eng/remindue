import { computeDDay, computeDeadline, computeDeadlines } from './purchase-logic';
import type { PendingPurchaseResponse, PendingPurchaseRow, PurchaseResponse, PurchaseRow } from '../types';

export function toPurchaseResponse(row: PurchaseRow): PurchaseResponse {
  const { deadline, deliveryRound } = computeDeadline(row);
  const dDay = computeDDay(deadline);

  // GENERAL이 반품기한/A·S보증을 동시에 가질 수 있어서(computeDeadlines 참고) 카드가 둘 다 따로
  // 보여줄 수 있게 각 인스턴스의 날짜/D-day를 별도 필드로도 노출한다. 하나만 있으면 나머지는 null.
  const instances = computeDeadlines(row);
  const returnInstance = instances.find((i) => i.kind === 'RETURN') ?? null;
  const warrantyInstance = instances.find((i) => i.kind === 'WARRANTY') ?? null;

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
    returnDeadlineDate: returnInstance?.deadline ?? null,
    returnDeadlineDDay: returnInstance ? computeDDay(returnInstance.deadline) : null,
    warrantyDeadlineDate: warrantyInstance?.deadline ?? null,
    warrantyDeadlineDDay: warrantyInstance ? computeDDay(warrantyInstance.deadline) : null,
    deliveryConfirmCount: row.delivery_confirm_count,
    discontinuedAt: row.discontinued_at,
    brand: row.brand,
    brandDomain: row.brand_domain,
    originalAmount: row.original_amount,
    originalCurrency: row.original_currency,
    exchangeRate: row.exchange_rate,
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
    warrantyMonths: row.warranty_months,
    intervalDays: row.interval_days,
    scheduleType: row.schedule_type,
    fixedDayOfMonth: row.fixed_day_of_month,
    scheduleEstimated: row.schedule_estimated === 1,
    amount: row.amount,
    category: row.category,
    matchedPurchaseId: row.matched_purchase_id,
    previousAmount: row.previous_amount,
    brand: row.brand,
    brandDomain: row.brand_domain,
    originalAmount: row.original_amount,
    originalCurrency: row.original_currency,
    exchangeRate: row.exchange_rate,
    status: row.status,
    createdAt: row.created_at,
  };
}

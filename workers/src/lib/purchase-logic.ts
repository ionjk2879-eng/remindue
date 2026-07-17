// Ported from backend/src/main/java/com/remindue/domain/purchase/Purchase.java
// (computeDeadline / markDelivered) — same defaults, same per-type field usage.

import { addDays, addMonths, daysBetween, todayDateOnly } from './date';
import type { PurchaseRow, PurchaseType } from '../types';

export const DEFAULT_WARRANTY_MONTHS = 12;
export const DEFAULT_RETURN_DEADLINE_DAYS = 7;
export const DEFAULT_INTERVAL_DAYS = 30;

type DeadlineInput = Pick<
  PurchaseRow,
  'type' | 'base_date' | 'warranty_months' | 'return_deadline_days' | 'interval_days' | 'last_delivered_date'
>;

/** 종류에 맞는 "챙겨야 할 기한"을 계산한다. */
export function computeDeadline(row: DeadlineInput): string {
  switch (row.type as PurchaseType) {
    case 'ELECTRONICS':
      return addMonths(row.base_date, row.warranty_months ?? DEFAULT_WARRANTY_MONTHS);
    case 'ONLINE_ORDER':
      return addDays(row.base_date, row.return_deadline_days ?? DEFAULT_RETURN_DEADLINE_DAYS);
    case 'RECURRING_DELIVERY': {
      const from = row.last_delivered_date ?? row.base_date;
      return addDays(from, row.interval_days ?? DEFAULT_INTERVAL_DAYS);
    }
  }
}

export function computeDDay(deadline: string): number {
  return daysBetween(todayDateOnly(), deadline);
}

/** 정기배송 전용 — "배송 받았음"을 눌렀을 때, 다음 배송일 기준일(오늘)을 반환한다. */
export function nextLastDeliveredDate(type: PurchaseType): string {
  if (type !== 'RECURRING_DELIVERY') {
    throw new InvalidPurchaseOperationError('정기배송 항목에서만 배송 완료 처리를 할 수 있습니다');
  }
  return todayDateOnly();
}

export class InvalidPurchaseOperationError extends Error {}

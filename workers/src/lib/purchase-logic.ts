// Originally ported from backend/src/main/java/com/remindue/domain/purchase/Purchase.java.
// RECURRING_DELIVERY's computeDeadline has since diverged from that reference: the Java
// version anchored to lastDeliveredDate (rolling from whenever the user last confirmed
// receipt), which drifts away from the vendor's real schedule after any late delivery.
// This now anchors to baseDate as a fixed recurring schedule instead (see computeDeadline).

import { addDays, addMonths, daysBetween, todayDateOnly } from './date';
import type { PurchaseRow, PurchaseType } from '../types';

export const DEFAULT_WARRANTY_MONTHS = 12;
export const DEFAULT_RETURN_DEADLINE_DAYS = 7;
export const DEFAULT_INTERVAL_DAYS = 30;
/** 무료 플랜(is_premium=0)이 등록할 수 있는 최대 항목 개수. 프리미엄은 무제한. */
export const FREE_PLAN_MAX_PURCHASES = 5;

type DeadlineInput = Pick<PurchaseRow, 'type' | 'base_date' | 'warranty_months' | 'return_deadline_days' | 'interval_days'>;

export interface DeadlineResult {
  deadline: string;
  /** RECURRING_DELIVERY 전용 — 몇 회차 배송인지(1회차 = baseDate). 그 외 타입은 null. */
  deliveryRound: number | null;
}

/** 종류에 맞는 "챙겨야 할 기한"을 계산한다. */
export function computeDeadline(row: DeadlineInput): DeadlineResult {
  switch (row.type as PurchaseType) {
    case 'ELECTRONICS':
      return { deadline: addMonths(row.base_date, row.warranty_months ?? DEFAULT_WARRANTY_MONTHS), deliveryRound: null };
    case 'ONLINE_ORDER':
      return {
        deadline: addDays(row.base_date, row.return_deadline_days ?? DEFAULT_RETURN_DEADLINE_DAYS),
        deliveryRound: null,
      };
    case 'RECURRING_DELIVERY': {
      // 고정 스케줄: baseDate + intervalDays의 배수 중 "오늘" 이후로 가장 가까운 날짜.
      // 실제 수령 확인일과 무관하게 항상 최초 구독일 기준 스케줄을 따른다 —
      // 한 번 늦게 받았다고 이후 스케줄 전체가 밀리지 않는다.
      // 회차: 1회차 = baseDate(k=0), n회차 = baseDate + (n-1)*intervalDays.
      // 다음 배송 회차 = 지금 막 지난 사이클 수(k) + 1.
      const interval = row.interval_days ?? DEFAULT_INTERVAL_DAYS;
      const daysSinceStart = daysBetween(row.base_date, todayDateOnly());
      const cyclesElapsed = Math.max(0, Math.ceil(daysSinceStart / interval));
      return {
        deadline: addDays(row.base_date, interval * cyclesElapsed),
        deliveryRound: cyclesElapsed + 1,
      };
    }
  }
}

export function computeDDay(deadline: string): number {
  return daysBetween(todayDateOnly(), deadline);
}

/**
 * "확인을 놓친 배송이 있을 수 있어요" 배지에 쓰는 값 — deliveryRound(다음 배송 회차 번호)는
 * 아직 도래하지 않은 회차도 미리 가리키므로(예: 등록 직후엔 dDay>0인데도 deliveryRound=1),
 * dDay > 0(그 회차가 아직 안 왔음)이면 그 회차는 확인 대상에서 빼고 이미 도래한 회차
 * (deliveryRound - 1)까지만 확인 여부를 센다. dDay <= 0(오늘이 바로 그 회차)이면 그 회차까지
 * 포함해서 센다.
 */
export function computeMissedConfirmations(deliveryRound: number, dDay: number, confirmCount: number): number {
  const roundsAlreadyDue = dDay > 0 ? deliveryRound - 1 : deliveryRound;
  return Math.max(0, roundsAlreadyDue - confirmCount);
}

/**
 * 정기배송 전용 — "이번 회차 수령 확인"을 눌렀을 때 기록할 참고용 날짜(오늘)를 반환한다.
 * 이 값은 last_delivered_date에 로그로만 남고, computeDeadline은 더 이상 이 값을 읽지 않는다
 * (다음 배송일은 항상 baseDate 기준 고정 스케줄로만 계산됨).
 */
export function confirmReceiptToday(type: PurchaseType): string {
  if (type !== 'RECURRING_DELIVERY') {
    throw new InvalidPurchaseOperationError('정기배송 항목에서만 수령 확인을 할 수 있습니다');
  }
  return todayDateOnly();
}

export class InvalidPurchaseOperationError extends Error {}

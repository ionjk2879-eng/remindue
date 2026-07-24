// Originally ported from backend/src/main/java/com/remindue/domain/purchase/Purchase.java.
// RECURRING_DELIVERY's computeDeadline has since diverged from that reference: the Java
// version anchored to lastDeliveredDate (rolling from whenever the user last confirmed
// receipt), which drifts away from the vendor's real schedule after any late delivery.
// This now anchors to baseDate as a fixed recurring schedule instead (see computeDeadline).

import { addDays, addMonths, daysBetween, nextFixedDayOfMonth, parseDateOnly, todayDateOnly } from './date';
import { isRecurringType, type PurchaseRow, type PurchaseType } from '../types';

export const DEFAULT_WARRANTY_MONTHS = 12;
export const DEFAULT_RETURN_DEADLINE_DAYS = 7;
export const DEFAULT_INTERVAL_DAYS = 30;
/** 무료 플랜(is_premium=0)이 등록할 수 있는 최대 항목 개수. 프리미엄은 무제한. */
export const FREE_PLAN_MAX_PURCHASES = 5;

type DeadlineInput = Pick<PurchaseRow, 'type' | 'base_date' | 'warranty_months' | 'return_deadline_days' | 'interval_days' | 'schedule_type' | 'fixed_day_of_month'>;

export interface DeadlineResult {
  deadline: string;
  /** RECURRING_DELIVERY 전용 — 몇 회차 배송인지(1회차 = baseDate). 그 외 타입은 null. */
  deliveryRound: number | null;
}

export type DeadlineKind = 'RETURN' | 'WARRANTY' | 'SCHEDULE';

export interface DeadlineInstance extends DeadlineResult {
  kind: DeadlineKind;
}

/**
 * GENERAL은 반품기한/A·S 보증기간을 동시에 가질 수 있어(둘 다 선택 입력) 한 구매 행이 서로 다른
 * 시점의 리마인드를 최대 2건 만들어낼 수 있다 — D-day 다이제스트(digest.ts)는 이 배열을 그대로
 * 순회해서 각 인스턴스를 독립적으로 알림 대상 여부를 판단한다. RECURRING_DELIVERY/SUBSCRIPTION은
 * 지금까지처럼 스케줄 인스턴스 1개뿐이다.
 */
export function computeDeadlines(row: DeadlineInput): DeadlineInstance[] {
  switch (row.type as PurchaseType) {
    case 'GENERAL': {
      const instances: DeadlineInstance[] = [];
      if (row.return_deadline_days !== null) {
        instances.push({ kind: 'RETURN', deadline: addDays(row.base_date, row.return_deadline_days), deliveryRound: null });
      }
      if (row.warranty_months !== null) {
        instances.push({ kind: 'WARRANTY', deadline: addMonths(row.base_date, row.warranty_months), deliveryRound: null });
      }
      // 둘 다 비어있는 건 정상적으론 없어야 하지만(등록 폼이 반품기한을 항상 기본값과 함께 보냄),
      // 방어적으로 반품기한 기본값(7일) 하나는 남겨서 기한이 아예 없는 항목이 생기지 않게 한다.
      if (instances.length === 0) {
        instances.push({ kind: 'RETURN', deadline: addDays(row.base_date, DEFAULT_RETURN_DEADLINE_DAYS), deliveryRound: null });
      }
      return instances;
    }
    case 'RECURRING_DELIVERY':
    case 'SUBSCRIPTION': {
      const scheduleType = row.schedule_type ?? 'INTERVAL';

      if (scheduleType === 'FIXED_DAY') {
        // 매월 고정일 방식: 오늘 이후 가장 가까운 fixedDayOfMonth 날짜를 다음 일정으로 삼는다.
        // 회차: 구독 시작월(baseDate 기준)부터 다음 일정까지 몇 달이 지났는지 + 1.
        const fixedDay = row.fixed_day_of_month ?? 1;
        const deadline = nextFixedDayOfMonth(fixedDay, todayDateOnly());
        const base = parseDateOnly(row.base_date);
        const next = parseDateOnly(deadline);
        const monthsElapsed = (next.year - base.year) * 12 + (next.month - base.month);
        return [{ kind: 'SCHEDULE', deadline, deliveryRound: monthsElapsed + 1 }];
      }

      // INTERVAL(기본): baseDate + intervalDays*k 방식.
      // 회차: 1회차 = baseDate(k=0), n회차 = baseDate + (n-1)*intervalDays.
      const interval = row.interval_days ?? DEFAULT_INTERVAL_DAYS;
      const daysSinceStart = daysBetween(row.base_date, todayDateOnly());
      const cyclesElapsed = Math.max(0, Math.ceil(daysSinceStart / interval));
      return [
        {
          kind: 'SCHEDULE',
          deadline: addDays(row.base_date, interval * cyclesElapsed),
          deliveryRound: cyclesElapsed + 1,
        },
      ];
    }
  }
}

/**
 * 카드 배지/정렬/CSV·PDF export처럼 "항목당 기한 1개"를 가정하는 소비처를 위한 대표 기한 —
 * computeDeadlines() 중 오늘 이후 가장 가까운 것(전부 지났으면 가장 덜 지난 것)을 고른다.
 * RECURRING_DELIVERY/SUBSCRIPTION, 또는 GENERAL이라도 둘 중 하나만 있으면 항상 그 값과 동일하다.
 */
export function computeDeadline(row: DeadlineInput): DeadlineResult {
  const instances = computeDeadlines(row);
  const today = todayDateOnly();
  const upcoming = instances.filter((i) => i.deadline >= today).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const chosen = upcoming[0] ?? instances.slice().sort((a, b) => b.deadline.localeCompare(a.deadline))[0];
  return { deadline: chosen.deadline, deliveryRound: chosen.deliveryRound };
}

export function computeDDay(deadline: string): number {
  return daysBetween(todayDateOnly(), deadline);
}

/** frontend StampBadge.tsx의 getVariant와 동일한 구간 — CSV/PDF 내보내기의 "상태" 열에도 같은 어휘를 쓴다. */
export function computeStatusLabel(dDay: number): string {
  if (dDay < 0) return '지남';
  if (dDay <= 3) return '긴급';
  if (dDay <= 14) return '임박';
  return '여유';
}

/**
 * 정기구독·배송 전용 — "이번 회차 확인"을 눌렀을 때 기록할 참고용 날짜(오늘)를 반환한다.
 * 이 값은 last_delivered_date에 로그로만 남고, computeDeadline은 더 이상 이 값을 읽지 않는다
 * (다음 일정은 항상 baseDate 기준 고정 스케줄로만 계산됨).
 */
export function confirmReceiptToday(type: PurchaseType): string {
  if (!isRecurringType(type)) {
    throw new InvalidPurchaseOperationError('정기구독·배송 항목에서만 회차 확인을 할 수 있습니다');
  }
  return todayDateOnly();
}

export class InvalidPurchaseOperationError extends Error {}

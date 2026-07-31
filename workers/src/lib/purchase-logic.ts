// Originally ported from backend/src/main/java/com/remindue/domain/purchase/Purchase.java.
// RECURRING_DELIVERY's computeDeadline has since diverged from that reference: the Java
// version anchored to lastDeliveredDate (rolling from whenever the user last confirmed
// receipt), which drifts away from the vendor's real schedule after any late delivery.
// This now anchors to baseDate as a fixed recurring schedule instead (see computeDeadline).
//
// GENERAL/RECURRING_DELIVERY got a second anchor field on top of that (expected_delivery_date,
// migrations/0031): "도착(예정)일" — a vendor's recurring delivery cycle is phased off the
// *first delivery* date, not the signup/order date (signing up mid-cycle doesn't shift the
// vendor's fixed weekly/monthly rhythm); a one-off GENERAL purchase's return/warranty windows
// legally start from when you *received* it, not when you paid. expectedDeliveryDate ?? baseDate
// is the shared anchor rule for both (arrivalAnchor below) — SUBSCRIPTION keeps baseDate-only,
// unchanged, since there's no physical delivery to anchor on. This does NOT reintroduce the
// lastDeliveredDate drift bug above — expectedDeliveryDate only ever moves when the user
// explicitly answers "did it arrive, and which day" (arrival-confirm.ts), never from silently
// logging a click/cron tick.

import { addBusinessDays, addDays, addMonths, daysBetween, formatDateOnly, nextFixedDayEveryNMonths, parseDateOnly, subtractBusinessDays, todayDateOnly } from './date';
import { isNonDeliveryDay } from './kr-holidays';
import { isRecurringType, usesArrivalDate, type PurchaseRow, type PurchaseType } from '../types';

export const DEFAULT_WARRANTY_MONTHS = 12;
export const DEFAULT_RETURN_DEADLINE_DAYS = 7;
export const DEFAULT_INTERVAL_DAYS = 30;
/** 무료 플랜(is_premium=0)이 등록할 수 있는 최대 항목 개수. 프리미엄은 무제한. */
export const FREE_PLAN_MAX_PURCHASES = 5;

type DeadlineInput = Pick<
  PurchaseRow,
  | 'type'
  | 'base_date'
  | 'warranty_months'
  | 'return_deadline_days'
  | 'interval_days'
  | 'schedule_type'
  | 'fixed_day_of_month'
  | 'fixed_day_interval_months'
  | 'is_one_time'
  | 'expected_delivery_date'
  | 'arrival_offset_days'
>;

/**
 * GENERAL/RECURRING_DELIVERY는 expectedDeliveryDate(있으면)를 앵커로 쓰고, 없으면 baseDate로
 * 폴백한다(usesArrivalDate). SUBSCRIPTION은 실물 배송이 없어 baseDate 그대로. 도착 확인 알림
 * (arrival-confirm.ts)도 "오늘이 이 앵커 날짜인가"로 발송 대상을 판단하므로 이 함수를 그대로 쓴다.
 */
export function arrivalAnchor(row: Pick<DeadlineInput, 'type' | 'base_date' | 'expected_delivery_date'>): string {
  return usesArrivalDate(row.type as PurchaseType) ? (row.expected_delivery_date ?? row.base_date) : row.base_date;
}

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
 * arrival_offset_days가 설정된 정기배송(RECURRING_DELIVERY) 전용 — 실제 정기배송 "회차별
 * 상세정보" 데이터로 검증된 방향: 도착예정일이 진짜 고정 앵커고(anchor의 "일"이 매
 * intervalMonths마다 반복되며, 토·일·공휴일이면 다음 영업일로 밀림 — 노동절은 실제 택배가
 * 쉬지 않으므로 제외), 결제일은 그 도착일에서 영업일 offsetBusinessDays일을 거꾸로 센 값이다.
 * k(0-based cycle 인덱스)로 특정 회차를 직접 계산할 수 있게 노출한다 — deliveryRound=k+1,
 * computePreviousScheduleDeadline에서 "직전 회차"(k-1)를 구할 때도 재사용한다.
 */
function arrivalAnchoredCycleFor(
  k: number,
  intervalMonths: number,
  anchorDateStr: string,
  offsetBusinessDays: number
): { deadline: string; arrivalDate: string } {
  const anchor = parseDateOnly(anchorDateStr);
  const totalMonths = anchor.year * 12 + (anchor.month - 1) + k * intervalMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths - targetYear * 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(anchor.day, daysInTargetMonth);
  const rawArrival = formatDateOnly(targetYear, targetMonth, clampedDay);
  const arrivalDate = addBusinessDays(rawArrival, 0, isNonDeliveryDay);
  const deadline = subtractBusinessDays(arrivalDate, offsetBusinessDays, isNonDeliveryDay);
  return { deadline, arrivalDate };
}

/**
 * todayStr 기준으로 "현재" 회차를 찾는다. compareBy='arrivalDate'(기본)면 도착일이 today
 * 이후(포함)인 가장 가까운 회차 — 결제는 이미 끝났어도 아직 도착 전이면 그 회차를 그대로
 * 유지한다(1회차 결제 다음날처럼 도착 전 상태에서 벌써 다음 회차로 넘어가 보이던 버그 수정,
 * INTERVAL+offset 쪽 cyclesElapsed 계산은 원래부터 도착일 기준이었다 — 그것과 맞춘 것).
 * compareBy='deadline'은 "한 번만 사용" 계산에서만 쓴다 — 그건 유일한 일정으로 다음 주기
 * 경계(k=1) 자체를 원하므로 todayStr을 anchor+1일로 넘겨 결제일 기준으로 강제 스킵한다.
 */
function nextArrivalAnchoredCycle(
  intervalMonths: number,
  anchorDateStr: string,
  todayStr: string,
  offsetBusinessDays: number,
  compareBy: 'deadline' | 'arrivalDate' = 'arrivalDate'
): { deadline: string; arrivalDate: string; k: number } {
  const anchor = parseDateOnly(anchorDateStr);
  const today = parseDateOnly(todayStr);
  const anchorTotalMonths = anchor.year * 12 + (anchor.month - 1);
  const todayTotalMonths = today.year * 12 + (today.month - 1);

  // 결제일이 도착일보다 항상 앞서므로, 도착일 기준 k값보다 한 회차 앞에서부터 확인을 시작한다.
  let k = Math.max(0, Math.floor((todayTotalMonths - anchorTotalMonths) / intervalMonths) - 1);
  let cycle = arrivalAnchoredCycleFor(k, intervalMonths, anchorDateStr, offsetBusinessDays);
  while (cycle[compareBy] < todayStr) {
    k += 1;
    cycle = arrivalAnchoredCycleFor(k, intervalMonths, anchorDateStr, offsetBusinessDays);
  }
  return { ...cycle, k };
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
      // 반품기한/A·S보증 모두 "받은 날"부터 세는 게 맞다 — expected_delivery_date(도착일)가
      // 있으면 그걸, 없으면(수동 등록 등으로 미기재) base_date(구매일)로 폴백한다.
      const anchor = arrivalAnchor(row);
      const instances: DeadlineInstance[] = [];
      if (row.return_deadline_days !== null) {
        instances.push({ kind: 'RETURN', deadline: addDays(anchor, row.return_deadline_days), deliveryRound: null });
      }
      if (row.warranty_months !== null) {
        instances.push({ kind: 'WARRANTY', deadline: addMonths(anchor, row.warranty_months), deliveryRound: null });
      }
      // 둘 다 비어있는 건 정상적으론 없어야 하지만(등록 폼이 반품기한을 항상 기본값과 함께 보냄),
      // 방어적으로 반품기한 기본값(7일) 하나는 남겨서 기한이 아예 없는 항목이 생기지 않게 한다.
      if (instances.length === 0) {
        instances.push({ kind: 'RETURN', deadline: addDays(anchor, DEFAULT_RETURN_DEADLINE_DAYS), deliveryRound: null });
      }
      return instances;
    }
    case 'RECURRING_DELIVERY':
    case 'SUBSCRIPTION': {
      const scheduleType = row.schedule_type ?? 'INTERVAL';
      const anchor = arrivalAnchor(row);

      // "한 번만 사용"은 오늘 결제/배송을 다시 확인할 정기 항목이 아니라, 이번 이용 기간이
      // 끝나는 날을 한 번만 알려주는 항목이다. 기존에는 아래 반복 스케줄과 같은 계산을 써서
      // interval의 k=0(=anchor, 보통 등록 당일)이 D-day로 잡혔다. 최초 주기 끝을 유일한 일정으로
      // 계산하면 기존에 저장된 항목도 별도 데이터 수정 없이 같은 기준으로 바로 보정된다.
      if (row.is_one_time === 1) {
        if (scheduleType === 'FIXED_DAY') {
          const intervalMonths = row.fixed_day_interval_months ?? 1;
          // arrival_offset_days가 설정된 정기배송은 도착예정일이 진짜 고정 앵커라 결제일을
          // 거기서 거꾸로 역산한다(arrivalAnchoredCycleFor 참고). 그 외(오프셋 없음)는 기존처럼
          // fixedDayOfMonth 자체가 결제일이고 공휴일 보정이 없다.
          if (row.arrival_offset_days !== null) {
            // "한 번만 사용"은 최초 주기의 끝(다음 결제일 경계)을 원하는 것이라 기존 그대로
            // 결제일 기준으로 anchor+1일부터 찾는다 — 도착일 기준으로 바꾸면 anchor 자체가
            // 다음 도착일보다 이르다는 이유만으로 k=0에 그대로 머물러버릴 수 있다.
            const { deadline } = nextArrivalAnchoredCycle(intervalMonths, anchor, addDays(anchor, 1), row.arrival_offset_days, 'deadline');
            return [{ kind: 'SCHEDULE', deadline, deliveryRound: 1 }];
          }
          const fixedDay = row.fixed_day_of_month ?? 1;
          // anchor와 같은 고정일이라도 이미 시작한 이번 달이 아니라 다음 달 고정일을 잡는다.
          const deadline = nextFixedDayEveryNMonths(fixedDay, intervalMonths, anchor, addDays(anchor, 1));
          return [{ kind: 'SCHEDULE', deadline, deliveryRound: 1 }];
        }

        const interval = row.interval_days ?? DEFAULT_INTERVAL_DAYS;
        return [{ kind: 'SCHEDULE', deadline: addDays(anchor, interval), deliveryRound: 1 }];
      }

      if (scheduleType === 'FIXED_DAY') {
        const intervalMonths = row.fixed_day_interval_months ?? 1;
        // arrival_offset_days가 설정된 정기배송: 도착예정일(anchor의 "일"이 매 N개월마다
        // 반복, 토·일·공휴일이면 다음 영업일로 밀림)이 고정 앵커고 결제일은 그 도착일에서
        // 영업일만큼 거꾸로 역산된 값이다 — 실제 정기배송 회차별 상세정보 데이터로 검증됨.
        if (row.arrival_offset_days !== null) {
          const { deadline, k } = nextArrivalAnchoredCycle(intervalMonths, anchor, todayDateOnly(), row.arrival_offset_days);
          return [{ kind: 'SCHEDULE', deadline, deliveryRound: k + 1 }];
        }
        // 오프셋이 없으면(대부분의 기존 항목) fixedDayOfMonth 자체가 결제일이고, 결제는
        // 공휴일과 무관하게 그대로 이뤄진다(사용자 확정: "결제일 자체는 공휴일이라도 결제됨").
        // 회차: 시작월(anchor 기준)부터 다음 일정까지 몇 달이 지났는지 ÷ N + 1.
        const fixedDay = row.fixed_day_of_month ?? 1;
        const deadline = nextFixedDayEveryNMonths(fixedDay, intervalMonths, anchor, todayDateOnly());
        const base = parseDateOnly(anchor);
        const next = parseDateOnly(deadline);
        const monthsElapsed = (next.year - base.year) * 12 + (next.month - base.month);
        return [{ kind: 'SCHEDULE', deadline, deliveryRound: Math.round(monthsElapsed / intervalMonths) + 1 }];
      }

      // INTERVAL(기본): anchor + intervalDays*k 방식.
      // 회차: 1회차 = anchor(k=0), n회차 = anchor + (n-1)*intervalDays.
      const interval = row.interval_days ?? DEFAULT_INTERVAL_DAYS;
      const daysSinceStart = daysBetween(anchor, todayDateOnly());
      const cyclesElapsed = Math.max(0, Math.ceil(daysSinceStart / interval));
      // FIXED_DAY와 동일하게 도착 예정일이 토·일·공휴일이면 다음 영업일로 밀고,
      // arrival_offset_days가 있으면 그 도착일로부터 영업일 역산으로 결제일을 구한다.
      const rawArrivalDate = addDays(anchor, interval * cyclesElapsed);
      const arrivalDate =
        row.arrival_offset_days !== null
          ? addBusinessDays(rawArrivalDate, 0, isNonDeliveryDay)
          : rawArrivalDate;

      // arrival_offset_days가 설정된 경우 FIXED_DAY와 동일하게 도착일에서 영업일 역산으로 결제일을
      // 구한다 — 주/일 단위 정기배송도 "도착 N영업일 전 = 결제" 패턴을 쓰기 때문이다.
      if (row.arrival_offset_days !== null) {
        const deadline = subtractBusinessDays(arrivalDate, row.arrival_offset_days, isNonDeliveryDay);
        return [{ kind: 'SCHEDULE', deadline, deliveryRound: cyclesElapsed + 1 }];
      }
      return [
        {
          kind: 'SCHEDULE',
          deadline: arrivalDate,
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

/**
 * RECURRING_DELIVERY 전용 — 결제일(deadline)로부터 도착예정일을 추정한다. 실제 정기배송
 * 회차별 상세정보(결제일/도착예정일 캡처 다수)를 역산한 결과 "결제일 + N영업일"(토·일·공휴일
 * 제외하고 세기) 규칙이 대체공휴일이 낀 회차까지 정확히 들어맞았다 — 결제일 자체는 공휴일이어도
 * 그대로 처리되지만(디지털 결제라 영업일과 무관), 실물 배송인 도착일은 영업일만 센다.
 * offsetDays가 null이면(사용자가 아직 입력 안 함) 추정하지 않고 null을 반환한다.
 */
export function computeArrivalEstimate(deadline: string, offsetDays: number | null): string | null {
  if (offsetDays === null) return null;
  return addBusinessDays(deadline, offsetDays, isNonDeliveryDay);
}

/**
 * 정기배송·구독의 바로 직전 회차 날짜. computeDeadline()은 늘 오늘 이후 회차를 반환하므로,
 * 다음 날 미확인 알림처럼 이미 지난 회차를 판별할 때 이 값을 별도로 계산한다.
 */
export function computePreviousScheduleDeadline(row: DeadlineInput): string | null {
  if (row.type !== 'RECURRING_DELIVERY' && row.type !== 'SUBSCRIPTION') return null;

  const anchor = arrivalAnchor(row);
  if ((row.schedule_type ?? 'INTERVAL') === 'FIXED_DAY' && row.arrival_offset_days !== null) {
    const intervalMonths = row.fixed_day_interval_months ?? 1;
    const { k } = nextArrivalAnchoredCycle(intervalMonths, anchor, todayDateOnly(), row.arrival_offset_days);
    if (k === 0) return null;
    // k-1(직전 회차)이 1회차(k-1===0)면 그 결제일은 도착일(anchor)에서 영업일만큼 역산한 값이라
    // anchor보다 항상 이르다 — "결제일이 anchor 이상이어야 유효"라는 가드는 결제일과 도착일 단위를
    // 혼동한 것이었다. 실제 사용자(1회차는 스토어가 정한 날짜에 그대로 도착하고, 결제일 자체가
    // 로직과 어긋나도 무방하다 — arrival이 신뢰값)의 확인으로 가드를 제거함. k-1>=1인 경우는
    // 원래도 이 조건이 항상 참이라 동작 변화 없음.
    return arrivalAnchoredCycleFor(k - 1, intervalMonths, anchor, row.arrival_offset_days).deadline;
  }

  const next = computeDeadline(row);
  const nextDeadline = next.deadline;
  let previous: string;
  if ((row.schedule_type ?? 'INTERVAL') === 'FIXED_DAY') {
    previous = addMonths(nextDeadline, -(row.fixed_day_interval_months ?? 1));
  } else if (row.arrival_offset_days !== null) {
    // INTERVAL + arrival_offset_days: nextDeadline이 결제일이므로, 도착일을 복원한 뒤
    // 직전 회차 도착일(공휴일이면 다음 영업일로 보정) → 결제일로 역산한다. 이 경로도 위
    // FIXED_DAY+offset 케이스와 같은 이유로 anchor(도착일 기준) 가드를 건너뛴다 — previous가
    // 1회차 결제일이면 도착일에서 영업일만큼 역산한 값이라 anchor보다 항상 이르다(단위 불일치).
    // 다음 일정 자체가 1회차(deliveryRound===1)면 그 이전 회차는 실제로 없으므로 null.
    if (next.deliveryRound === 1) return null;
    const interval = row.interval_days ?? DEFAULT_INTERVAL_DAYS;
    const nextArrival = addBusinessDays(nextDeadline, row.arrival_offset_days, isNonDeliveryDay);
    const prevArrival = addBusinessDays(addDays(nextArrival, -interval), 0, isNonDeliveryDay);
    previous = subtractBusinessDays(prevArrival, row.arrival_offset_days, isNonDeliveryDay);
    return previous;
  } else {
    previous = addDays(nextDeadline, -(row.interval_days ?? DEFAULT_INTERVAL_DAYS));
  }

  return previous >= anchor ? previous : null;
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

/** "받았어요" 답변의 daysAgo 선택지 — 도착 확인 알림이 뜬 당일(0)/하루 전(1)/이틀 전(2)만 받는다.
 *  그 이상은 물어보지 않는다(늦게 확인하는 사람도 보통 이 안에서 답한다 — arrival-confirm.ts). */
export const MAX_ARRIVAL_DAYS_AGO = 30;
export type ArrivalDaysAgo = number;

export function isValidArrivalDaysAgo(value: unknown): value is ArrivalDaysAgo {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_ARRIVAL_DAYS_AGO;
}

/**
 * GENERAL/RECURRING_DELIVERY 전용 — "오늘 받으셨나요?"에 "받았어요"로 답했을 때, 그 실제 도착일을
 * 계산한다. 이 값이 새 expected_delivery_date(앵커)가 된다 — RECURRING_DELIVERY는 이후 회차가
 * 여기서부터 다시 계산되고, GENERAL은 반품기한·A/S보증 기산일이 이 날짜로 확정된다.
 */
export function resolveArrivalDate(daysAgo: ArrivalDaysAgo): string {
  return addDays(todayDateOnly(), -daysAgo);
}

export class InvalidPurchaseOperationError extends Error {}

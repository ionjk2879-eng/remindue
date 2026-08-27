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
import { isNonBusinessDay, isNonDeliveryDay } from './kr-holidays';
import { isRecurringType, usesArrivalDate, type PurchaseRow, type PurchaseType } from '../types';

export const DEFAULT_WARRANTY_MONTHS = 12;
export const DEFAULT_RETURN_DEADLINE_DAYS = 7;
export const DEFAULT_INTERVAL_DAYS = 30;

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
> & { delivery_round_offset?: number };

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
  const deadline = subtractBusinessDays(arrivalDate, offsetBusinessDays, isNonBusinessDay);
  return { deadline, arrivalDate };
}

/**
 * todayStr 기준으로 "현재" 회차를 찾는다 — 결제일(deadline)이 today 이후(포함)인 가장 가까운
 * 회차. RECURRING_DELIVERY는 실제 도착 여부를 더 이상 묻지 않으므로(arrival-confirm.ts는
 * GENERAL 전용) 회차 갱신의 기준도 도착일이 아니라 결제일이어야 한다 — 결제가 끝나면 그
 * 순간부터 "다음 결제"를 기다리는 게 맞고, 도착이 아직 안 왔다는 이유로 이전 회차를 붙들고
 * 있을 이유가 없다(SUBSCRIPTION/오프셋 없는 FIXED_DAY도 원래부터 결제일 기준이라 이렇게
 * 맞춰야 서로 다른 회차 갱신 규칙이 생기지 않는다).
 */
function nextArrivalAnchoredCycle(
  intervalMonths: number,
  anchorDateStr: string,
  todayStr: string,
  offsetBusinessDays: number
): { deadline: string; arrivalDate: string; k: number } {
  const anchor = parseDateOnly(anchorDateStr);
  const today = parseDateOnly(todayStr);
  const anchorTotalMonths = anchor.year * 12 + (anchor.month - 1);
  const todayTotalMonths = today.year * 12 + (today.month - 1);

  // 결제일이 도착일보다 항상 앞서므로, 도착일 기준 k값보다 한 회차 앞에서부터 확인을 시작한다.
  let k = Math.max(0, Math.floor((todayTotalMonths - anchorTotalMonths) / intervalMonths) - 1);
  let cycle = arrivalAnchoredCycleFor(k, intervalMonths, anchorDateStr, offsetBusinessDays);
  while (cycle.deadline < todayStr) {
    k += 1;
    cycle = arrivalAnchoredCycleFor(k, intervalMonths, anchorDateStr, offsetBusinessDays);
  }
  return { ...cycle, k };
}

/**
 * INTERVAL(주·일 단위) + arrival_offset_days 전용 — todayStr 기준 "현재" 회차(0-based
 * cyclesElapsed)를 찾는다. 원시 도착일(anchor + interval*k)이 아니라 영업일 보정까지 끝난
 * 실제 결제일(deadline)이 today를 지나야 다음 회차로 넘어간다 — ceil(daysSinceStart/interval)
 * 같은 닫힌 식으로는 원시 도착일이 주말/공휴일이라 실제 도착일이 뒤로 밀린 회차에서, 원시
 * 날짜만 지났을 뿐 실제 결제 전인데도 벌써 다음 회차로 표시되는 문제가 있었다(FIXED_DAY의
 * nextArrivalAnchoredCycle과 같은 종류의 문제, 여기선 개월이 아니라 일 단위라 별도 함수).
 * 도착일이 아니라 결제일로 게이팅하는 이유는 nextArrivalAnchoredCycle 주석 참고 —
 * RECURRING_DELIVERY는 실제 도착 여부를 묻지 않으므로 회차 갱신은 항상 결제일 기준이다.
 */
function nextIntervalAnchoredCycle(
  interval: number,
  anchorDateStr: string,
  todayStr: string,
  offsetBusinessDays: number
): { cyclesElapsed: number; arrivalDate: string; deadline: string } {
  const cycleArrival = (k: number) => addBusinessDays(addDays(anchorDateStr, interval * k), 0, isNonDeliveryDay);
  const cycleDeadline = (arrivalDate: string) => subtractBusinessDays(arrivalDate, offsetBusinessDays, isNonBusinessDay);
  let cyclesElapsed = Math.max(0, Math.floor(daysBetween(anchorDateStr, todayStr) / interval) - 1);
  let arrivalDate = cycleArrival(cyclesElapsed);
  let deadline = cycleDeadline(arrivalDate);
  while (deadline < todayStr) {
    cyclesElapsed += 1;
    arrivalDate = cycleArrival(cyclesElapsed);
    deadline = cycleDeadline(arrivalDate);
  }
  return { cyclesElapsed, arrivalDate, deadline };
}

/**
 * GENERAL은 반품기한/A·S 보증기간을 동시에 가질 수 있어(둘 다 선택 입력) 한 구매 행이 서로 다른
 * 시점의 리마인드를 최대 2건 만들어낼 수 있다 — D-day 다이제스트(digest.ts)는 이 배열을 그대로
 * 순회해서 각 인스턴스를 독립적으로 알림 대상 여부를 판단한다. RECURRING_DELIVERY/SUBSCRIPTION은
 * 지금까지처럼 스케줄 인스턴스 1개뿐이다.
 */
function computeRawDeadlines(row: DeadlineInput, referenceDate: string): DeadlineInstance[] {
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
            // "한 번만 사용"은 최초 주기의 끝(다음 결제일 경계)을 원하므로 anchor+1일부터
            // 찾는다 — anchor 그대로 넘기면 anchor 자체가 이미 다음 결제일보다 이르다는
            // 이유만으로 k=0에 그대로 머물러버릴 수 있다.
            const { deadline } = nextArrivalAnchoredCycle(intervalMonths, anchor, addDays(anchor, 1), row.arrival_offset_days);
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
          const { deadline, k } = nextArrivalAnchoredCycle(intervalMonths, anchor, referenceDate, row.arrival_offset_days);
          return [{ kind: 'SCHEDULE', deadline, deliveryRound: k + 1 }];
        }
        // 오프셋이 없으면(대부분의 기존 항목) fixedDayOfMonth 자체가 결제일이고, 결제는
        // 공휴일과 무관하게 그대로 이뤄진다(사용자 확정: "결제일 자체는 공휴일이라도 결제됨").
        // 회차: 시작월(anchor 기준)부터 다음 일정까지 몇 달이 지났는지 ÷ N + 1.
        const fixedDay = row.fixed_day_of_month ?? 1;
        const deadline = nextFixedDayEveryNMonths(fixedDay, intervalMonths, anchor, referenceDate);
        const base = parseDateOnly(anchor);
        const next = parseDateOnly(deadline);
        const monthsElapsed = (next.year - base.year) * 12 + (next.month - base.month);
        return [{ kind: 'SCHEDULE', deadline, deliveryRound: Math.round(monthsElapsed / intervalMonths) + 1 }];
      }

      // INTERVAL(기본): anchor + intervalDays*k 방식.
      // 회차: 1회차 = anchor(k=0), n회차 = anchor + (n-1)*intervalDays.
      const interval = row.interval_days ?? DEFAULT_INTERVAL_DAYS;

      // arrival_offset_days가 설정된 경우 FIXED_DAY와 동일하게 도착일에서 영업일 역산으로 결제일을
      // 구한다 — 주/일 단위 정기배송도 "도착 N영업일 전 = 결제" 패턴을 쓰기 때문이다. 몇 회차인지도
      // 원시 날짜(anchor + interval*k)가 아니라 영업일 보정까지 끝난 실제 결제일 기준으로 찾는다.
      if (row.arrival_offset_days !== null) {
        const { cyclesElapsed, deadline } = nextIntervalAnchoredCycle(interval, anchor, referenceDate, row.arrival_offset_days);
        return [{ kind: 'SCHEDULE', deadline, deliveryRound: cyclesElapsed + 1 }];
      }

      const daysSinceStart = daysBetween(anchor, referenceDate);
      const cyclesElapsed = Math.max(0, Math.ceil(daysSinceStart / interval));
      const arrivalDate = addDays(anchor, interval * cyclesElapsed);
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

/** 중단 기간에 건너뛴 회차만큼 번호를 보정하되 판매처의 일정 날짜는 그대로 유지한다. */
export function computeDeadlines(row: DeadlineInput, referenceDate = todayDateOnly()): DeadlineInstance[] {
  const offset = row.delivery_round_offset ?? 0;
  return computeRawDeadlines(row, referenceDate).map((instance) => ({
    ...instance,
    deliveryRound: instance.deliveryRound === null ? null : Math.max(1, instance.deliveryRound - offset),
  }));
}

/**
 * 카드 배지/정렬/CSV·PDF export처럼 "항목당 기한 1개"를 가정하는 소비처를 위한 대표 기한 —
 * computeDeadlines() 중 오늘 이후 가장 가까운 것(전부 지났으면 가장 덜 지난 것)을 고른다.
 * RECURRING_DELIVERY/SUBSCRIPTION, 또는 GENERAL이라도 둘 중 하나만 있으면 항상 그 값과 동일하다.
 */
export function computeDeadline(row: DeadlineInput): DeadlineResult {
  return computeDeadlineAt(row, todayDateOnly());
}

/** 과거 중단 시점처럼 특정 날짜를 기준으로 당시 표시 회차를 복원한다. */
export function computeDeadlineAt(row: DeadlineInput, referenceDate: string): DeadlineResult {
  const instances = computeDeadlines(row, referenceDate);
  const upcoming = instances.filter((i) => i.deadline >= referenceDate).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const chosen = upcoming[0] ?? instances.slice().sort((a, b) => b.deadline.localeCompare(a.deadline))[0];
  return { deadline: chosen.deadline, deliveryRound: chosen.deliveryRound };
}

/**
 * 항목 수정(PUT)으로 시작일/스케줄이 바뀌어도 "현재 표시 회차"가 그대로 유지되도록
 * delivery_round_offset을 다시 계산한다. 안 그러면 실제 결제일이 바뀌어 시작일을 정직하게
 * 고쳤을 뿐인데 회차 번호가 뚝 떨어져 보인다(예: 15회차 항목의 시작일을 최근 결제일로
 * 갱신했더니 갑자기 "2회차"로 보이는 문제) — resumePurchaseSchedule(routes/purchases.ts)과
 * 같은 오프셋 보정 원리를 그대로 쓴다. 회차 개념이 없는 타입(GENERAL)이나 1회성 항목은
 * deliveryRound가 애초에 null이거나 항상 1이라 그대로 0을 반환한다.
 */
export function recomputeRoundOffsetForEdit(existing: DeadlineInput, updated: DeadlineInput): number {
  const previousRound = computeDeadline(existing).deliveryRound;
  if (previousRound === null) return 0;
  const rawNewRound = computeDeadline({ ...updated, delivery_round_offset: 0 }).deliveryRound;
  if (rawNewRound === null) return 0;
  return rawNewRound - previousRound;
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
 * RECURRING_DELIVERY 카드에 참고용으로 보여주는 도착 예상 범위 — 설정(arrival_offset_days)
 * 여부와 무관하게 결제일(deadline)만으로 항상 계산한다. "결제일 다음날~그다음날" 달력일
 * 그대로이고, 그 날짜가 일요일·공휴일이면(토요일은 배송일이라 그대로 둠) 다음 날로 하루씩
 * 민다 — 정확한 하루를 맞히려는 게 아니라 "이날 아니면 이날" 정도의 참고치라, N영업일을 세는
 * computeArrivalEstimate와 달리 각 끝점을 독립적으로만 보정한다. 목요일 결제 → 금~토,
 * 금요일 결제 → 토~월(실제 결제는 항상 월~금이라 토요일 결제 자체는 실무상 발생하지 않는다 —
 * 이 로직은 그 가정에 의존하지 않지만, 실측 결제일 데이터 전부가 그 가정과 일치했다).
 */
export function estimateArrivalRange(deadline: string): { from: string; to: string } {
  const nextDeliveryDay = (dateStr: string): string => {
    let current = dateStr;
    while (isNonDeliveryDay(current)) current = addDays(current, 1);
    return current;
  };
  return {
    from: nextDeliveryDay(addDays(deadline, 1)),
    to: nextDeliveryDay(addDays(deadline, 2)),
  };
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
    previous = subtractBusinessDays(prevArrival, row.arrival_offset_days, isNonBusinessDay);
    return previous;
  } else {
    previous = addDays(nextDeadline, -(row.interval_days ?? DEFAULT_INTERVAL_DAYS));
  }

  return previous >= anchor ? previous : null;
}

export function computeDDay(deadline: string): number {
  return daysBetween(todayDateOnly(), deadline);
}

/**
 * 정기배송·구독에서 "확인 안 된 회차 수". frontend dashboardModel.tsx의 동명 함수와 계산식이
 * 동일하다(프론트/워커 분리라 공유 불가 — 이건 워커 내부 mapper.ts/confirmation-nudge.ts가
 * 공유하는 워커 쪽 유일한 구현).
 */
export function missedRoundsFor(deliveryRound: number | null, deliveryConfirmCount: number, dDay: number): number {
  if (deliveryRound === null) return 0;
  const confirmableRounds = dDay <= 0 ? deliveryRound : deliveryRound - 1;
  return Math.max(0, confirmableRounds - deliveryConfirmCount);
}

/**
 * 마지막 회차가 결제일로부터 1주일(confirmation-nudge.ts의 "절약 검토 대상" 알림 시점)까지도
 * 미확인 상태로 남아있는지 — true면 대시보드/내 목록/정기구독 현황에서 "지난 항목"으로 취급한다
 * (shared/domain-policy.ts isPastItem). "유지하기"를 안 눌렀다고 결제 당일 바로 지난 항목으로
 * 보내는 게 아니라, 알림 사이클(당일→D+1→D+7)이 전부 끝날 때까지는 정상 노출한다 — 확인만
 * 하면(delivery_confirm_count가 올라가면) missedRounds가 0으로 돌아가 자동으로 다시 활성화된다.
 * 1회성 항목·이미 "유지 안 함"으로 명시한 항목은 여기서 다루지 않는다(isPastItem에서 별도 처리).
 */
export function isPastDueUnconfirmed(row: DeadlineInput & { delivery_confirm_count: number; renewal_decision_for: string | null; discontinued_at: string | null }): boolean {
  if (row.type !== 'RECURRING_DELIVERY' && row.type !== 'SUBSCRIPTION') return false;
  if (row.is_one_time === 1 || row.discontinued_at !== null) return false;

  const { deliveryRound } = computeDeadline(row);
  const dDay = computeDDay(computeDeadline(row).deadline);
  const missedRounds = missedRoundsFor(deliveryRound, row.delivery_confirm_count, dDay);
  if (missedRounds < 1) return false;

  const previousDeadline = computePreviousScheduleDeadline(row);
  if (previousDeadline === null) return false;
  if (row.renewal_decision_for === previousDeadline) return false;

  return computeDDay(previousDeadline) <= -7;
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

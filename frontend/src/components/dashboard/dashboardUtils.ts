import { isRecurringType, type Purchase } from '../../types';
import { KR_HOLIDAY_DATES } from './kr-holidays-data';

export function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}`;
}

/**
 * intervalDays(일 단위)를 등록 폼과 같은 감각의 "N주"/"N달" 표현으로 바꾼다. 30의 배수면
 * 달, 7의 배수면 주로 보여주고, 어느 쪽도 나누어떨어지지 않으면(예: 60일이 아니라 45일처럼
 * 애매한 값) 반올림해서 보여주지 않고 원래 "N일"을 그대로 쓴다 — 반올림하면 이 표시값과
 * 실제 배송주기 계산(intervalDays 그대로 사용)이 어긋나 보일 수 있기 때문이다.
 */
export function formatIntervalDaysLabel(days: number): string {
  if (days % 30 === 0) return `${days / 30}달`;
  if (days % 7 === 0) return `${days / 7}주`;
  return `${days}일`;
}

/** 티켓 카드 정보 그리드용 — formatShortDate에 연도를 더한 버전. */
export function formatShortDateWithYear(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${year}.${month}.${day}`;
}

export function formatKoreanMonthDay(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}월 ${day}일`;
}

export function todayDateOnly(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export function isWithinUpcomingDays(dateStr: string, days: number): boolean {
  const start = new Date(`${todayDateOnly()}T00:00:00+09:00`).getTime();
  const target = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  const dDay = Math.round((target - start) / 86_400_000);
  return dDay >= 0 && dDay <= days;
}

export function isWithinRecentDays(dateStr: string, days: number): boolean {
  const today = new Date(`${todayDateOnly()}T00:00:00+09:00`).getTime();
  const target = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  const elapsed = Math.round((today - target) / 86_400_000);
  return elapsed >= 0 && elapsed <= days;
}

export function shiftDateOnly(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** workers/src/lib/kr-holidays.ts와 동일 — 토·일 또는 공휴일이면 true. */
function isNonDeliveryDay(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  return KR_HOLIDAY_DATES.has(dateStr);
}

/** workers/src/lib/date.ts의 addBusinessDays/subtractBusinessDays와 동일 — 정기배송 결제일/
 *  도착예정일 계산(도착일이 고정 앵커, 결제일은 영업일만큼 거꾸로 역산)에 프론트에서도 같은
 *  값을 내려면 이 두 함수가 필요하다(프론트/백엔드가 별도 패키지라 공유 불가, 기존 중복 패턴). */
function addBusinessDays(dateStr: string, offsetDays: number): string {
  let current = dateStr;
  let remaining = offsetDays;
  while (remaining > 0) {
    current = shiftDateOnly(current, 1);
    if (!isNonDeliveryDay(current)) remaining -= 1;
  }
  while (isNonDeliveryDay(current)) {
    current = shiftDateOnly(current, 1);
  }
  return current;
}

function subtractBusinessDays(dateStr: string, offsetDays: number): string {
  let current = dateStr;
  let remaining = offsetDays;
  while (remaining > 0) {
    current = shiftDateOnly(current, -1);
    if (!isNonDeliveryDay(current)) remaining -= 1;
  }
  while (isNonDeliveryDay(current)) {
    current = shiftDateOnly(current, -1);
  }
  return current;
}

export function previousFixedScheduleDate(dateStr: string, fixedDay: number, intervalMonths = 1): string {
  const [year, month] = dateStr.split('-').map(Number);
  const previousMonthIndex = month - 1 - Math.max(1, intervalMonths);
  const previousMonthLastDay = new Date(Date.UTC(year, previousMonthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, previousMonthIndex, Math.min(fixedDay, previousMonthLastDay))).toISOString().slice(0, 10);
}

export function currentCalendarWeekRange(today = todayDateOnly()): { start: string; end: string } {
  const weekday = new Date(`${today}T00:00:00+09:00`).getDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const start = shiftDateOnly(today, -daysSinceMonday);
  return { start, end: shiftDateOnly(start, 6) };
}

export function daysSinceBaseDate(baseDate: string): number {
  const start = new Date(`${baseDate}T00:00:00`).getTime();
  const now = new Date(`${todayDateOnly()}T00:00:00`).getTime();
  return Math.floor((now - start) / 86_400_000);
}

function spendCutoffDate(purchase: Purchase): string | null {
  const dates = [purchase.archivedAt, purchase.discardedAt, purchase.discontinuedAt]
    .filter((date): date is string => date !== null)
    .map((date) => date.slice(0, 10));
  return dates.length === 0 ? null : dates.sort()[0];
}

function scheduleAnchorDate(purchase: Purchase): string {
  return purchase.type === 'RECURRING_DELIVERY'
    ? purchase.expectedDeliveryDate ?? purchase.baseDate
    : purchase.baseDate;
}

export function occurrenceDatesInMonth(purchase: Purchase, year: number, month: number): string[] {
  if (!isRecurringType(purchase.type)) return [];
  const anchorDate = scheduleAnchorDate(purchase);
  const [baseYear, baseMonth] = anchorDate.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  const cutoff = spendCutoffDate(purchase);

  if (purchase.isOneTime) {
    return baseYear === year && baseMonth === month && (cutoff === null || anchorDate <= cutoff) ? [anchorDate] : [];
  }

  if (purchase.scheduleType === 'FIXED_DAY') {
    const intervalMonths = Math.max(1, purchase.fixedDayIntervalMonths || 1);

    if (purchase.arrivalOffsetDays !== null) {
      // 도착예정일(anchorDate의 "일"이 매 intervalMonths마다 반복, 토·일·공휴일이면 다음
      // 영업일로 밀림)이 고정 앵커고 결제일은 그 도착일에서 영업일만큼 거꾸로 역산된
      // 값이다(실제 정기배송 데이터로 검증됨). 역산 결과가 원래 회차의 "명목상 월"이 아니라
      // 하루이틀 전달로 넘어갈 수 있어(예: 도착이 1일이면 결제가 전달 말일), 목표 월 앞뒤
      // 회차까지 넉넉히 계산해서 실제 결제일이 이 월에 들어오는지 직접 확인한다.
      const anchorDay = Number(anchorDate.slice(8, 10));
      const anchorTotalMonths = baseYear * 12 + (baseMonth - 1);
      const targetTotalMonths = year * 12 + (month - 1);
      const nominalK = Math.round((targetTotalMonths - anchorTotalMonths) / intervalMonths);
      const dates: string[] = [];
      for (let k = nominalK - 1; k <= nominalK + 1; k++) {
        if (k < 0) continue;
        const totalMonths = anchorTotalMonths + k * intervalMonths;
        const targetYear = Math.floor(totalMonths / 12);
        const targetMonthIdx = totalMonths - targetYear * 12; // 0-indexed
        const daysInTargetMonth = new Date(targetYear, targetMonthIdx + 1, 0).getDate();
        const clampedDay = Math.min(anchorDay, daysInTargetMonth);
        const rawArrival = `${targetYear}-${pad(targetMonthIdx + 1)}-${pad(clampedDay)}`;
        const arrivalDate = addBusinessDays(rawArrival, 0);
        const deadline = subtractBusinessDays(arrivalDate, purchase.arrivalOffsetDays);
        const [deadlineYear, deadlineMonth] = deadline.split('-').map(Number);
        if (deadlineYear === year && deadlineMonth === month && (cutoff === null || deadline <= cutoff)) {
          dates.push(deadline);
        }
      }
      return dates.sort();
    }

    const started = year > baseYear || (year === baseYear && month >= baseMonth);
    if (!started) return [];
    // 매 N개월 고정일 스케줄(오프셋 없음) — 앵커 월(baseMonth)로부터 intervalMonths 간격인
    // 달에만 회차가 있다(intervalMonths=1이면 기존 "매월" 동작과 완전히 동일).
    const monthDiff = (year - baseYear) * 12 + (month - baseMonth);
    if (monthDiff % intervalMonths !== 0) return [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const day = Math.min(purchase.fixedDayOfMonth ?? 1, daysInMonth);
    const date = `${year}-${pad(month)}-${pad(day)}`;
    return cutoff !== null && date > cutoff ? [] : [date];
  }

  const interval = Math.max(1, purchase.intervalDays || 30);
  const monthStart = new Date(`${year}-${pad(month)}-01T00:00:00`).getTime();
  const monthEndExclusive = new Date(month === 12 ? `${year + 1}-01-01T00:00:00` : `${year}-${pad(month + 1)}-01T00:00:00`).getTime();
  const baseTime = new Date(`${anchorDate}T00:00:00`).getTime();
  if (baseTime >= monthEndExclusive) return [];

  const stepMs = interval * 86_400_000;
  const firstOccurrence = Math.max(0, Math.ceil((monthStart - baseTime) / stepMs));
  const dates: string[] = [];
  for (let time = baseTime + firstOccurrence * stepMs; time < monthEndExclusive; time += stepMs) {
    if (time < monthStart) continue;
    const date = new Date(time);
    const dateOnly = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    if (cutoff === null || dateOnly <= cutoff) dates.push(dateOnly);
  }
  return dates;
}

export function occurrencesInMonth(purchase: Purchase, year: number, month: number): number {
  return occurrenceDatesInMonth(purchase, year, month).length;
}

/**
 * 티켓 카드 정보 그리드의 "결제일" 표시용 — purchase.deadline은 항상 "다음" 회차라서 이번 달
 * 결제가 이미 지났으면 다음 달 날짜가 나온다("다음 일정" 줄과 중복되고 헷갈림). 이번 달에
 * 해당하는 결제일이 있으면 그걸(여러 번이면 마지막) 보여주고, 이번 달엔 주기가 안 걸리면
 * (예: 긴 간격) 다음 예정일로 대체한다.
 */
export function currentCycleDeadline(purchase: Purchase, year: number, month: number): string {
  const inMonth = occurrenceDatesInMonth(purchase, year, month);
  return inMonth.length > 0 ? inMonth[inMonth.length - 1] : purchase.deadline;
}

export function totalSpendInMonth(purchases: Purchase[], year: number, month: number): number {
  let total = 0;
  for (const purchase of purchases) {
    if (purchase.amount === null) continue;
    if (isRecurringType(purchase.type)) {
      total += occurrencesInMonth(purchase, year, month) * purchase.amount;
    } else {
      const [baseYear, baseMonth] = purchase.baseDate.split('-').map(Number);
      if (baseYear === year && baseMonth === month) total += purchase.amount;
    }
  }
  return Math.round(total);
}

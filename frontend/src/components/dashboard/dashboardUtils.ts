import { isRecurringType, type Purchase } from '../../types';

export function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}`;
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
    const started = year > baseYear || (year === baseYear && month >= baseMonth);
    if (!started) return [];
    // 매 N개월 고정일 스케줄 — 앵커 월(baseMonth)로부터 intervalMonths 간격인 달에만 회차가 있다
    // (intervalMonths=1이면 기존 "매월" 동작과 완전히 동일).
    const intervalMonths = Math.max(1, purchase.fixedDayIntervalMonths || 1);
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

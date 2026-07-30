// Date-only (yyyy-MM-dd) arithmetic helpers. The calendar math (addDays/addMonths/daysBetween)
// operates on UTC internally since it's pure y-m-d arithmetic with no "current time" involved —
// only todayDateOnly() needs a real timezone, since that's the one place we ask "what day is it
// right now" (see its own comment for why that's KST, not UTC).
// addMonths clamps to the last valid day of the target month, matching java.time.LocalDate#plusMonths
// (e.g. 2026-01-31 + 1 month -> 2026-02-28, not an overflowed 2026-03-03).

export function parseDateOnly(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function formatDateOnly(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const { year, month, day } = parseDateOnly(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function addMonths(dateStr: string, months: number): string {
  const { year, month, day } = parseDateOnly(dateStr);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths - targetYear * 12; // 0-11

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return formatDateOnly(targetYear, targetMonth, clampedDay);
}

export function daysBetween(fromStr: string, toStr: string): number {
  const from = parseDateOnly(fromStr);
  const to = parseDateOnly(toStr);
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * KST(Asia/Seoul, UTC+9, DST 없음) 기준 "오늘". UTC로 계산하면 한국 자정이 지나도
 * UTC 자정(한국 시간 오전 9시)까지는 여전히 어제로 취급되는 버그가 있었다 —
 * 예: 한국 시간 7/18 00:17은 UTC로는 아직 7/17 15:17이라 배송일 계산이 하루 안 넘어감.
 */
export function todayDateOnly(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * FIXED_DAY 스케줄 전용 — 매월 fixedDay에 해당하는, today 이후(오늘 포함) 가장 가까운 날짜.
 * 그 달에 fixedDay가 없으면(예: 2월의 31일) 해당 달의 마지막 날로 보정한다.
 */
export function nextFixedDayOfMonth(fixedDay: number, todayStr: string): string {
  const { year, month, day } = parseDateOnly(todayStr); // month: 1-12

  // 이번 달 시도 — Date.UTC(year, month, 0)은 month월의 마지막 날(0번째 다음 달 = 이전 달 마지막)
  const daysInCurrent = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedCurrent = Math.min(fixedDay, daysInCurrent);
  if (clampedCurrent >= day) {
    return formatDateOnly(year, month - 1, clampedCurrent); // formatDateOnly는 0-indexed month
  }

  // 다음 달로 넘어감
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthIdx = month % 12; // 0-indexed: 1월(1)→0, 12월(12)→0이 다음 해 1월
  const daysInNext = new Date(Date.UTC(nextYear, nextMonthIdx + 1, 0)).getUTCDate();
  return formatDateOnly(nextYear, nextMonthIdx, Math.min(fixedDay, daysInNext));
}

/**
 * FIXED_DAY 스케줄을 "매월"이 아니라 "매 N개월"로 일반화한 버전 — anchorDateStr(1회차 기준일)의
 * (year, month)에서 시작해 intervalMonths 단위로만 후보 월을 잡는다. 실제 정기배송 사례(회차별
 * 상세정보)를 보면 결제일은 2회차부터 "같은 날짜가 N개월 간격으로" 반복되는 패턴으로 안정된다.
 * intervalMonths=1이면 nextFixedDayOfMonth와 정확히 같은 결과를 낸다(날짜 클램프 규칙도 addMonths와
 * 동일하게 해당 월의 마지막 날로 보정).
 */
export function nextFixedDayEveryNMonths(
  fixedDay: number,
  intervalMonths: number,
  anchorDateStr: string,
  todayStr: string
): string {
  const anchor = parseDateOnly(anchorDateStr);
  const today = parseDateOnly(todayStr);

  const anchorTotalMonths = anchor.year * 12 + (anchor.month - 1); // 0-indexed 월
  const todayTotalMonths = today.year * 12 + (today.month - 1);

  const candidateFor = (k: number): string => {
    const totalMonths = anchorTotalMonths + k * intervalMonths;
    const targetYear = Math.floor(totalMonths / 12);
    const targetMonth = totalMonths - targetYear * 12; // 0-indexed
    const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const clampedDay = Math.min(fixedDay, daysInTargetMonth);
    return formatDateOnly(targetYear, targetMonth, clampedDay);
  };

  let k = Math.max(0, Math.floor((todayTotalMonths - anchorTotalMonths) / intervalMonths));
  let candidate = candidateFor(k);
  while (candidate < todayStr) {
    k += 1;
    candidate = candidateFor(k);
  }
  return candidate;
}

/**
 * 결제일로부터 "영업일"로 N일을 세어 도달하는 날짜 — 실제 정기배송 도착예정일 계산에 쓰인다.
 * isNonDeliveryDay(토·일·공휴일)인 날은 세지 않고 건너뛴다. offsetDays=0이면 결제일 당일이
 * 영업일일 때만 그대로 반환(영업일이 아니면 다음 영업일로).
 */
export function addBusinessDays(dateStr: string, offsetDays: number, isNonDeliveryDay: (d: string) => boolean): string {
  let current = dateStr;
  let remaining = offsetDays;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (!isNonDeliveryDay(current)) remaining -= 1;
  }
  while (isNonDeliveryDay(current)) {
    current = addDays(current, 1);
  }
  return current;
}

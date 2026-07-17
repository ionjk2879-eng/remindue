// Date-only (yyyy-MM-dd) arithmetic helpers, UTC-based to avoid timezone drift.
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

export function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

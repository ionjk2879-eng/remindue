import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, nextFixedDayOfMonth } from './date';

describe('date helpers', () => {
  it('handles leap days and year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('clamps month addition to the last valid day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('finds the nearest fixed day and clamps short months', () => {
    expect(nextFixedDayOfMonth(31, '2026-02-10')).toBe('2026-02-28');
    expect(nextFixedDayOfMonth(15, '2026-07-15')).toBe('2026-07-15');
    expect(nextFixedDayOfMonth(15, '2026-07-16')).toBe('2026-08-15');
  });
});

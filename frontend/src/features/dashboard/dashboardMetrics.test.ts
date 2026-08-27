import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import {
  calculateCategorySpending,
  calculateSelectedSpend,
  calculateYearlySpending,
  computeSpendingByDate,
  selectCalculatorPurchases,
} from './dashboardMetrics';

const general = {
  id: 1,
  type: 'GENERAL',
  itemName: '노트북',
  baseDate: '2026-08-03',
  amount: 100000,
  category: 'ELECTRONICS',
  discardedAt: null,
} as Purchase;

describe('dashboardMetrics', () => {
  it('groups one-time spending by date without changing the amount', () => {
    const result = computeSpendingByDate([general], 2026, 8);
    expect(result.total).toBe(100000);
    expect(result.byDate).toEqual([{
      date: '2026-08-03',
      total: 100000,
      items: [{ key: '1', itemName: '노트북', type: 'GENERAL', date: '2026-08-03', amount: 100000 }],
    }]);
  });

  it('derives yearly, category, and selected totals from the same source data', () => {
    const yearly = calculateYearlySpending([general], 2026, 8);
    const categories = calculateCategorySpending([general], 2026, 8);
    expect(yearly.yearlyTotal).toBe(100000);
    expect(yearly.monthlyDetails[7].total).toBe(100000);
    expect(categories.categoryCounts).toContainEqual({ category: 'ELECTRONICS', count: 1, amount: 100000 });
    expect(calculateSelectedSpend([general], [1], 2026, 8)).toBe(100000);
    expect(calculateSelectedSpend([general], [], 2026, 8)).toBe(0);
  });

  it('limits calculator records to the selected month, keeping discarded ones (spend still counts)', () => {
    const july = { ...general, id: 2, baseDate: '2026-07-10' } as Purchase;
    const deleted = { ...general, id: 3, discardedAt: '2026-08-20T00:00:00.000Z' } as Purchase;

    expect(selectCalculatorPurchases([general, july, deleted], 2026, 8).map(({ id }) => id)).toEqual([1, 3]);
  });

  it('uses the recorded amount for a selected recurring payment month', () => {
    const recurring = {
      ...general,
      id: 4,
      type: 'SUBSCRIPTION',
      baseDate: '2026-07-15',
      scheduleType: 'FIXED_DAY',
      fixedDayOfMonth: 15,
      fixedDayIntervalMonths: 1,
      isOneTime: false,
      arrivalOffsetDays: null,
      paymentHistory: [{ cycleDate: '2026-08-15', amount: 80000 }],
      discardedAt: null,
      archivedAt: null,
      discontinuedAt: null,
    } as Purchase;

    expect(calculateSelectedSpend([recurring], [4], 2026, 8)).toBe(80000);
  });

  it('does not include recurring occurrences that fall inside a completed pause', () => {
    const paused = {
      ...general,
      id: 5,
      type: 'SUBSCRIPTION',
      baseDate: '2026-07-15',
      scheduleType: 'FIXED_DAY',
      fixedDayOfMonth: 15,
      fixedDayIntervalMonths: 1,
      isOneTime: false,
      arrivalOffsetDays: null,
      paymentHistory: [],
      discontinuedAt: null,
      schedulePausePeriods: [{ from: '2026-07-20', to: '2026-09-01' }],
    } as Purchase;

    expect(selectCalculatorPurchases([paused], 2026, 8)).toEqual([]);
    expect(calculateSelectedSpend([paused], [5], 2026, 8)).toBe(0);
  });
});

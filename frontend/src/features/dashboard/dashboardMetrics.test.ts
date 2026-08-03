import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import {
  calculateCategorySpending,
  calculateSelectedSpend,
  calculateYearlySpending,
  computeSpendingByDate,
} from './dashboardMetrics';

const general = {
  id: 1,
  type: 'GENERAL',
  itemName: '노트북',
  baseDate: '2026-08-03',
  amount: 100000,
  category: 'ELECTRONICS',
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
});

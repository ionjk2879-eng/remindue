import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import {
  formatAmountInput,
  groupByCategory,
  missedRoundsFor,
  parseAmountInput,
  renderRecurringScheduleLine,
} from './dashboardModel';

function purchase(overrides: Partial<Purchase>): Purchase {
  return {
    id: 1, type: 'SUBSCRIPTION', itemName: 'test', dDay: 3, paymentDDay: 3,
    deliveryRound: 2, deliveryConfirmCount: 1, discontinuedAt: null, isOneTime: false,
    category: null, categoryTags: [], scheduleType: 'INTERVAL', fixedDayOfMonth: null,
    fixedDayIntervalMonths: 1, deadline: '2026-08-10', arrivalRangeEstimate: null,
    ...overrides,
  } as Purchase;
}

describe('dashboardModel', () => {
  it('formats and parses won inputs outside the page component', () => {
    expect(formatAmountInput('1234567')).toBe('1,234,567');
    expect(parseAmountInput('1,234,567원')).toBe(1_234_567);
  });

  it('calculates unconfirmed recurring rounds', () => {
    expect(missedRoundsFor(purchase({ paymentDDay: 0, deliveryRound: 4, deliveryConfirmCount: 1 }))).toBe(3);
    expect(missedRoundsFor(purchase({ type: 'GENERAL' }))).toBe(0);
  });

  it('groups purchases by category and keeps uncategorized last', () => {
    const groups = groupByCategory([
      purchase({ id: 1, category: null }),
      purchase({ id: 2, category: 'AI' }),
    ]);
    expect(groups.map((group) => group.category)).toEqual(['AI', 'UNCATEGORIZED']);
  });

  it('renders a stopped recurring schedule consistently', () => {
    render(renderRecurringScheduleLine(purchase({ discontinuedAt: '2026-08-01' })));
    expect(screen.getByText(/유지 안 함/)).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import { todayDateOnly } from '../../components/dashboard/dashboardUtils';
import { needsAttentionBadge, selectWeeklyDashboard } from './dashboardWeekly';

const purchase = (overrides: Partial<Purchase> = {}) => ({
  id: 1,
  type: 'GENERAL',
  itemName: '배송 상품',
  dDay: 0,
  paymentDDay: 0,
  expectedDeliveryDate: todayDateOnly(),
  arrivalRangeEstimate: null,
  arrivalCheckSnoozedUntil: null,
  lastDeliveredDate: null,
  isOneTime: false,
  discontinuedAt: null,
  deliveryRound: null,
  deliveryConfirmCount: 0,
  ...overrides,
}) as Purchase;

describe('dashboardWeekly', () => {
  it('selects urgent and arrival-check items in one deterministic snapshot', () => {
    const item = purchase();
    const result = selectWeeklyDashboard([item]);
    expect(result.urgent).toEqual([item]);
    expect(result.arrivalChecks).toEqual([item]);
    expect(result.arrivalSnoozedCount).toBe(0);
  });

  it('shows attention only for unanswered recurring items', () => {
    const recurring = purchase({ type: 'SUBSCRIPTION', deliveryRound: 2, deliveryConfirmCount: 0 });
    expect(needsAttentionBadge(recurring)).toBe(true);
    expect(needsAttentionBadge({ ...recurring, isOneTime: true })).toBe(false);
    expect(needsAttentionBadge(purchase())).toBe(false);
  });
});

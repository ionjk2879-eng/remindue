import { describe, expect, it } from 'vitest';
import type { PendingPurchase, Purchase } from '../../types';
import { selectPurchaseList, selectPurchaseSignals } from './dashboardSelectors';

const purchase = (id: number, overrides: Partial<Purchase> = {}) => ({
  id,
  type: 'GENERAL',
  itemName: `항목 ${id}`,
  dDay: 5,
  isOneTime: false,
  discontinuedAt: null,
  category: 'OTHER',
  amount: 1000,
  priceChangePreviousAmount: null,
  deliveryRound: null,
  deliveryConfirmCount: 0,
  ...overrides,
}) as Purchase;

describe('dashboardSelectors', () => {
  it('separates past items and applies filters before pagination', () => {
    const purchases = [
      purchase(1, { dDay: -1 }),
      ...Array.from({ length: 6 }, (_, index) => purchase(index + 2)),
    ];
    const selected = selectPurchaseList(purchases, 'ALL', 'ALL', 2);
    expect(selected.overdueItems.map(({ id }) => id)).toEqual([1]);
    expect(selected.displayedPurchases).toHaveLength(6);
    expect(selected.totalPages).toBe(2);
    expect(selected.pagedPurchases.map(({ id }) => id)).toEqual([7]);
  });

  it('combines persisted and pending price changes without duplicating counts', () => {
    const recurring = purchase(3, {
      type: 'SUBSCRIPTION',
      scheduleType: 'FIXED_DAY',
      deliveryRound: 4,
      deliveryConfirmCount: 0,
      priceChangePreviousAmount: 900,
    });
    const pending = {
      matchedPurchaseId: 3,
      previousAmount: 900,
      amount: 1000,
    } as PendingPurchase;
    const selected = selectPurchaseSignals([recurring], [pending]);
    expect(selected.priceChangeCount).toBe(1);
    expect(selected.priceUpItems).toEqual([recurring]);
    expect(selected.reviewCandidates[0].monthly).toBe(1000);
    expect(selected.needsConfirmationItems).toEqual([recurring]);
  });
});

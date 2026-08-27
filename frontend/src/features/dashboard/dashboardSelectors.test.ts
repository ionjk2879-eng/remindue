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
  discardedAt: null,
  updatedAt: '2026-08-01T00:00:00Z',
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

  it('sends a one-time recurring item to overdue once its single deadline passes, even without a discontinue click', () => {
    const purchases = [
      purchase(1, { type: 'SUBSCRIPTION', isOneTime: true, dDay: -1 }),
      purchase(2, { type: 'SUBSCRIPTION', isOneTime: true, dDay: 5 }),
    ];
    const selected = selectPurchaseList(purchases, 'ALL', 'ALL', 1);
    expect(selected.overdueItems.map(({ id }) => id)).toEqual([1]);
    expect(selected.activeItems.map(({ id }) => id)).toEqual([2]);
  });

  it('sends an ongoing recurring item to overdue once the last round goes unconfirmed through the full nudge cycle', () => {
    const purchases = [
      purchase(1, { type: 'SUBSCRIPTION', dDay: 20, pastDueUnconfirmed: true }),
      purchase(2, { type: 'SUBSCRIPTION', dDay: 20, pastDueUnconfirmed: false }),
    ];
    const selected = selectPurchaseList(purchases, 'ALL', 'ALL', 1);
    expect(selected.overdueItems.map(({ id }) => id)).toEqual([1]);
    expect(selected.activeItems.map(({ id }) => id)).toEqual([2]);
  });

  it('sorts overdue/discarded items by most recently updated first', () => {
    const purchases = [
      purchase(1, { dDay: -1, updatedAt: '2026-08-01T00:00:00Z' }),
      purchase(2, { discardedAt: '2026-08-05T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z' }),
      purchase(3, { discardedAt: '2026-08-07T00:00:00Z', updatedAt: '2026-08-07T00:00:00Z' }),
    ];
    const selected = selectPurchaseList(purchases, 'ALL', 'ALL', 1);
    expect(selected.overdueItems.map(({ id }) => id)).toEqual([3, 2, 1]);
  });

  it('excludes discarded items from AI-brief signals', () => {
    const discarded = purchase(4, {
      type: 'SUBSCRIPTION',
      discardedAt: '2026-08-07T00:00:00Z',
      discontinuedAt: '2026-08-07T00:00:00Z',
    });
    const selected = selectPurchaseSignals([discarded], []);
    expect(selected.reviewCandidates).toEqual([]);
    expect(selected.needsConfirmationItems).toEqual([]);
  });

  it('offers an unresolved recurring decision during the seven-day window', () => {
    const upcoming = purchase(5, {
      type: 'SUBSCRIPTION',
      deliveryRound: 2,
      deliveryConfirmCount: 1,
      paymentDDay: 4,
      deadline: '2026-08-29',
      renewalDecisionFor: null,
    });
    const selected = selectPurchaseSignals([upcoming], []);
    expect(selected.needsConfirmationItems).toEqual([upcoming]);
    expect(selected.reviewCandidates).toEqual([]);
  });

  it('treats an explicit discontinue as resolved rather than usage-unconfirmed', () => {
    const stopped = purchase(6, {
      type: 'SUBSCRIPTION',
      deliveryRound: 5,
      deliveryConfirmCount: 0,
      paymentDDay: -2,
      discontinuedAt: '2026-08-25T00:00:00Z',
    });
    const selected = selectPurchaseSignals([stopped], []);
    expect(selected.reviewCandidates).toEqual([]);
    expect(selected.needsConfirmationItems).toEqual([]);
    expect(selected.unusedItems).toEqual([]);
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

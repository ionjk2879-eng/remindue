import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPurchases, fetchPurchasesForSpendHistory } from '../../api/purchases';
import { fetchReceivedInvites } from '../../api/sharing';
import type { Purchase } from '../../types';
import { useDashboardPurchases } from './useDashboardPurchases';

vi.mock('../../api/purchases', () => ({
  fetchPurchases: vi.fn(),
  fetchPurchasesForSpendHistory: vi.fn(),
}));
vi.mock('../../api/sharing', () => ({ fetchReceivedInvites: vi.fn() }));

const item = { id: 2, dDay: 4 } as Purchase;

describe('useDashboardPurchases', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchPurchases).mockResolvedValue([item]);
    vi.mocked(fetchPurchasesForSpendHistory).mockResolvedValue([item]);
    vi.mocked(fetchReceivedInvites).mockResolvedValue([]);
  });

  it('loads server data and updates both active and spend-history state after an upsert', async () => {
    const { result } = renderHook(() => useDashboardPurchases('tester'));
    await waitFor(() => expect(result.current.purchasesLoaded).toBe(true));
    expect(result.current.purchases).toEqual([item]);

    const updated = { ...item, dDay: 1 };
    act(() => result.current.applyPurchaseUpsert(updated));
    expect(result.current.purchases[0]).toEqual(updated);
    expect(result.current.spendHistoryPurchases[0]).toEqual(updated);
    expect(JSON.parse(localStorage.getItem('purchases_cache_tester') ?? '[]')).toEqual([updated]);
  });

  it('refreshes purchases when a notification action changes server data', async () => {
    const { result } = renderHook(() => useDashboardPurchases('tester'));
    await waitFor(() => expect(result.current.purchasesLoaded).toBe(true));

    const delivered = { ...item, lastDeliveredDate: '2026-08-25' } as Purchase;
    vi.mocked(fetchPurchases).mockResolvedValue([delivered]);
    vi.mocked(fetchPurchasesForSpendHistory).mockResolvedValue([delivered]);

    act(() => window.dispatchEvent(new Event('remindue:data-refresh')));

    await waitFor(() => expect(result.current.purchases[0]).toEqual(delivered));
    expect(result.current.spendHistoryPurchases[0]).toEqual(delivered);
  });
});

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deletePurchase, discardAllPurchases } from '../../api/purchases';
import type { Purchase } from '../../types';
import { usePurchaseMutations } from './usePurchaseMutations';

vi.mock('../../api/purchases', () => ({
  archivePurchase: vi.fn(), confirmAllDelivered: vi.fn(), deletePurchase: vi.fn(),
  disableDeadlineNotifications: vi.fn(), discardAllPurchases: vi.fn(), discardPurchase: vi.fn(),
  discontinuePurchase: vi.fn(), markDelivered: vi.fn(), unarchivePurchase: vi.fn(),
}));

describe('usePurchaseMutations', () => {
  it('refreshes active and spend data after cancellation and bulk discard', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(deletePurchase).mockResolvedValue(undefined);
    vi.mocked(discardAllPurchases).mockResolvedValue(undefined);
    const load = vi.fn().mockResolvedValue(undefined);
    const loadSpendHistory = vi.fn().mockResolvedValue(undefined);
    const overdue = [{ id: 7, itemName: '지난 항목' }] as Purchase[];
    const { result } = renderHook(() => usePurchaseMutations({
      overdueItems: overdue,
      needsConfirmationItems: [],
      load,
      loadSpendHistory,
      loadArchived: vi.fn().mockResolvedValue(undefined),
      setConfirmedRecurringIds: vi.fn(),
      setConfirmAllMessage: vi.fn(),
    }));

    await result.current.handleDelete(7);
    await result.current.handleDiscardAll();
    expect(deletePurchase).toHaveBeenCalledWith(7);
    expect(discardAllPurchases).toHaveBeenCalledWith([7]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(loadSpendHistory).toHaveBeenCalledTimes(2);
  });
});

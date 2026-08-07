import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchAiSummary } from '../../api/purchases';
import type { Purchase } from '../../types';
import { useAiBrief } from './useAiBrief';

vi.mock('../../api/purchases', () => ({ fetchAiSummary: vi.fn() }));

describe('useAiBrief', () => {
  it('shows deterministic metrics immediately and prevents duplicate summary requests', async () => {
    let resolveSummary!: (value: { goodNews: string; attention: string; insight: string; annualSavingsSuggestion: string | null }) => void;
    vi.mocked(fetchAiSummary).mockReturnValue(new Promise((resolve) => { resolveSummary = resolve; }));
    const subscription = {
      id: 1,
      type: 'SUBSCRIPTION',
      itemName: '테스트 구독',
      baseDate: '2026-08-01',
      amount: 10000,
      category: 'SOFTWARE',
      isOneTime: false,
      discontinuedAt: null,
      archivedAt: null,
      discardedAt: null,
      stopAfterCurrentAt: null,
      paymentDDay: 3,
      deadline: '2026-08-06',
      renewalDecisionFor: null,
      scheduleType: 'FIXED_DAY',
      fixedDayOfMonth: 1,
      fixedDayIntervalMonths: 1,
      intervalDays: 30,
      originalCurrency: null,
      originalAmount: null,
      travelCardAmount: null,
      priceChangePreviousAmount: null,
      paymentHistory: [],
    } as unknown as Purchase;
    const { result } = renderHook(() => useAiBrief({
      purchases: [subscription],
      spendHistoryPurchases: [subscription],
      reviewCount: 0,
      priceUpItems: [],
      unusedItems: [],
      pendingPriceChangeByPurchaseId: new Map(),
      savingsEstimate: 0,
      fxCardSettings: null,
    }));

    act(() => {
      result.current.handleAiSummary();
      result.current.handleAiSummary();
    });
    expect(result.current.aiBrief?.totalRecurring).toBe(1);
    expect(result.current.aiBriefTextLoading).toBe(true);
    expect(fetchAiSummary).toHaveBeenCalledTimes(1);

    resolveSummary({ goodNews: '좋아요', attention: '확인', insight: '안정적', annualSavingsSuggestion: null });
    await waitFor(() => expect(result.current.aiBriefTextLoading).toBe(false));
    expect(result.current.aiBrief?.goodNews).toBe('좋아요');
  });
});

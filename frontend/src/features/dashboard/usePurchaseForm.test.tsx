import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import { usePurchaseForm } from './usePurchaseForm';

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: 1,
  type: 'GENERAL',
  itemName: '노트북',
  baseDate: '2026-08-01',
  amount: 1200000,
  memo: null,
  warrantyMonths: 24,
  returnDeadlineDays: 7,
  intervalDays: null,
  scheduleType: 'INTERVAL',
  fixedDayOfMonth: null,
  fixedDayIntervalMonths: 1,
  isOneTime: false,
  expectedDeliveryDate: '2026-08-03',
  arrivalOffsetDays: null,
  arrivalRangeEstimate: null,
  lastDeliveredDate: null,
  arrivalCheckSnoozedUntil: null,
  renewalDecisionFor: null,
  deadline: '2028-08-01',
  dDay: 728,
  paymentDDay: 728,
  deliveryRound: null,
  archivedAt: null,
  discardedAt: null,
  category: 'ELECTRONICS',
  categoryTags: ['ELECTRONICS'],
  returnDeadlineDate: '2026-08-08',
  returnDeadlineDDay: 5,
  warrantyDeadlineDate: '2028-08-01',
  warrantyDeadlineDDay: 728,
  deliveryConfirmCount: 0,
  discontinuedAt: null,
  stopAfterCurrentAt: null,
  deadlineNotificationsDisabledAt: null,
  brand: 'Example',
  brandDomain: 'example.com',
  originalAmount: null,
  originalCurrency: null,
  exchangeRate: null,
  travelCardAmount: null,
  priceChangePreviousAmount: null,
  paymentHistory: [],
  createdAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

describe('usePurchaseForm', () => {
  it('prefills an existing purchase and resets to defaults', () => {
    const { result } = renderHook(() => usePurchaseForm());

    act(() => result.current.beginEdit(purchase()));
    expect(result.current.editingId).toBe(1);
    expect(result.current.itemName).toBe('노트북');
    expect(result.current.amount).toBe('1,200,000');
    expect(result.current.categoryTags).toEqual(['ELECTRONICS']);

    act(() => result.current.resetForm());
    expect(result.current.editingId).toBeNull();
    expect(result.current.showRegisterForm).toBe(false);
    expect(result.current.type).toBe('GENERAL');
    expect(result.current.warrantyMonths).toBe('12');
  });
});

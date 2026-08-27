import { describe, expect, it } from 'vitest';
import {
  PURCHASE_TYPES,
  formatNotificationDays,
  isPastItem,
  isRecurringType,
} from '../../shared/domain-policy';
import configRoutes from '../src/routes/config';

describe('shared domain policy', () => {
  it('formats notification days as a slash-joined string', () => {
    expect(formatNotificationDays([7, 3, 0])).toBe('7/3/0');
  });

  it('exposes the purchase types through the public config endpoint', async () => {
    const response = await configRoutes.request('/domain');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ purchaseTypes: PURCHASE_TYPES });
  });

  it('classifies recurring purchase types in one place', () => {
    expect(isRecurringType('GENERAL')).toBe(false);
    expect(isRecurringType('RECURRING_DELIVERY')).toBe(true);
    expect(isRecurringType('SUBSCRIPTION')).toBe(true);
  });

  it('uses one past-item rule for owner and shared lists', () => {
    expect(isPastItem({ type: 'GENERAL', dDay: -1, isOneTime: false, discontinuedAt: null })).toBe(true);
    expect(isPastItem({ type: 'SUBSCRIPTION', dDay: 10, isOneTime: false, discontinuedAt: '2026-08-01' })).toBe(true);
    expect(isPastItem({ type: 'SUBSCRIPTION', dDay: 10, isOneTime: true, discontinuedAt: '2026-08-01' })).toBe(true);
  });

  it('sends a one-time recurring item past once its single deadline passes, even without an explicit discontinue', () => {
    expect(isPastItem({ type: 'SUBSCRIPTION', dDay: -1, isOneTime: true, discontinuedAt: null })).toBe(true);
    expect(isPastItem({ type: 'SUBSCRIPTION', dDay: 5, isOneTime: true, discontinuedAt: null })).toBe(false);
  });

  it('sends an ongoing recurring item past once the last round goes unconfirmed through the full nudge cycle', () => {
    expect(isPastItem({ type: 'RECURRING_DELIVERY', dDay: 20, isOneTime: false, discontinuedAt: null, pastDueUnconfirmed: true })).toBe(true);
    expect(isPastItem({ type: 'RECURRING_DELIVERY', dDay: 20, isOneTime: false, discontinuedAt: null, pastDueUnconfirmed: false })).toBe(false);
  });
});

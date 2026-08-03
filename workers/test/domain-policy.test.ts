import { describe, expect, it } from 'vitest';
import {
  FREE_NOTIFICATION_DAYS,
  FREE_PLAN_MAX_PURCHASES,
  PUBLIC_DOMAIN_CONFIG,
  formatNotificationDays,
  isPastItem,
  isRecurringType,
} from '../../shared/domain-policy';
import configRoutes from '../src/routes/config';

describe('shared domain policy', () => {
  it('publishes the free-plan limits used by domain logic', () => {
    expect(PUBLIC_DOMAIN_CONFIG.plans.free.maxPurchases).toBe(FREE_PLAN_MAX_PURCHASES);
    expect(PUBLIC_DOMAIN_CONFIG.plans.free.notificationDays).toBe(FREE_NOTIFICATION_DAYS);
    expect(formatNotificationDays(FREE_NOTIFICATION_DAYS)).toBe('7/3/0');
  });

  it('exposes the policy through the public config endpoint', async () => {
    const response = await configRoutes.request('/domain');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PUBLIC_DOMAIN_CONFIG);
  });

  it('classifies recurring purchase types in one place', () => {
    expect(isRecurringType('GENERAL')).toBe(false);
    expect(isRecurringType('RECURRING_DELIVERY')).toBe(true);
    expect(isRecurringType('SUBSCRIPTION')).toBe(true);
  });

  it('uses one past-item rule for owner and shared lists', () => {
    expect(isPastItem({ type: 'GENERAL', dDay: -1, isOneTime: false, discontinuedAt: null })).toBe(true);
    expect(isPastItem({ type: 'SUBSCRIPTION', dDay: 10, isOneTime: false, discontinuedAt: '2026-08-01' })).toBe(true);
    expect(isPastItem({ type: 'SUBSCRIPTION', dDay: 10, isOneTime: true, discontinuedAt: '2026-08-01' })).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseRow, PurchaseType } from '../types';
import {
  InvalidPurchaseOperationError,
  arrivalAnchor,
  computeDeadline,
  computeDeadlines,
  computePreviousScheduleDeadline,
  computeStatusLabel,
  confirmReceiptToday,
  isValidArrivalDaysAgo,
  resolveArrivalDate,
} from './purchase-logic';

type DeadlineRow = Pick<
  PurchaseRow,
  'type' | 'base_date' | 'warranty_months' | 'return_deadline_days' | 'interval_days' | 'schedule_type' | 'fixed_day_of_month' | 'is_one_time' | 'expected_delivery_date'
>;

function row(type: PurchaseType, overrides: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    type,
    base_date: '2026-07-01',
    warranty_months: null,
    return_deadline_days: null,
    interval_days: null,
    schedule_type: 'INTERVAL',
    fixed_day_of_month: null,
    is_one_time: 0,
    expected_delivery_date: null,
    ...overrides,
  };
}

describe('purchase deadline logic', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-07-27T03:00:00.000Z')));
  afterEach(() => vi.useRealTimers());

  it('uses the confirmed arrival date for physical purchases only', () => {
    expect(arrivalAnchor(row('GENERAL', { expected_delivery_date: '2026-07-10' }))).toBe('2026-07-10');
    expect(arrivalAnchor(row('RECURRING_DELIVERY', { expected_delivery_date: '2026-07-10' }))).toBe('2026-07-10');
    expect(arrivalAnchor(row('SUBSCRIPTION', { expected_delivery_date: '2026-07-10' }))).toBe('2026-07-01');
  });

  it('calculates return and warranty deadlines independently from arrival', () => {
    expect(computeDeadlines(row('GENERAL', {
      expected_delivery_date: '2026-01-31',
      return_deadline_days: 7,
      warranty_months: 1,
    }))).toEqual([
      { kind: 'RETURN', deadline: '2026-02-07', deliveryRound: null },
      { kind: 'WARRANTY', deadline: '2026-02-28', deliveryRound: null },
    ]);
  });

  it('keeps interval schedules anchored without drifting to confirmation day', () => {
    const recurring = row('RECURRING_DELIVERY', {
      expected_delivery_date: '2026-07-01',
      interval_days: 10,
      schedule_type: 'INTERVAL',
    });
    expect(computeDeadline(recurring)).toEqual({ deadline: '2026-07-31', deliveryRound: 4 });
    expect(computePreviousScheduleDeadline(recurring)).toBe('2026-07-21');
  });

  it('uses the next period as the only deadline for one-time recurring items', () => {
    expect(computeDeadline(row('SUBSCRIPTION', {
      base_date: '2026-07-01',
      interval_days: 30,
      schedule_type: 'INTERVAL',
      is_one_time: 1,
    }))).toEqual({ deadline: '2026-07-31', deliveryRound: 1 });
  });

  it('records and validates arrival dates within the 30-day range', () => {
    expect(isValidArrivalDaysAgo(0)).toBe(true);
    expect(isValidArrivalDaysAgo(30)).toBe(true);
    expect(isValidArrivalDaysAgo(31)).toBe(false);
    expect(isValidArrivalDaysAgo(1.5)).toBe(false);
    expect(resolveArrivalDate(3)).toBe('2026-07-24');
  });

  it('allows receipt confirmation only for recurring types', () => {
    expect(confirmReceiptToday('RECURRING_DELIVERY')).toBe('2026-07-27');
    expect(confirmReceiptToday('SUBSCRIPTION')).toBe('2026-07-27');
    expect(() => confirmReceiptToday('GENERAL')).toThrow(InvalidPurchaseOperationError);
  });

  it('keeps status label boundaries stable', () => {
    expect(computeStatusLabel(-1)).toBe('지남');
    expect(computeStatusLabel(0)).toBe('긴급');
    expect(computeStatusLabel(3)).toBe('긴급');
    expect(computeStatusLabel(4)).toBe('임박');
    expect(computeStatusLabel(14)).toBe('임박');
    expect(computeStatusLabel(15)).toBe('여유');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseRow, PurchaseType } from '../types';
import {
  InvalidPurchaseOperationError,
  arrivalAnchor,
  computeArrivalEstimate,
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
  | 'type'
  | 'base_date'
  | 'warranty_months'
  | 'return_deadline_days'
  | 'interval_days'
  | 'schedule_type'
  | 'fixed_day_of_month'
  | 'fixed_day_interval_months'
  | 'is_one_time'
  | 'expected_delivery_date'
  | 'arrival_offset_days'
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
    fixed_day_interval_months: 1,
    is_one_time: 0,
    expected_delivery_date: null,
    arrival_offset_days: null,
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

  it('steps back by fixed_day_interval_months for multi-month FIXED_DAY schedules', () => {
    const bimonthly = row('RECURRING_DELIVERY', {
      expected_delivery_date: '2026-03-01',
      schedule_type: 'FIXED_DAY',
      fixed_day_of_month: 1,
      fixed_day_interval_months: 2,
    });
    expect(computeDeadline(bimonthly).deadline).toBe('2026-09-01');
    // 1달만 되돌리면(과거 버그) 2026-08-01이 나오지만, 실제 직전 회차는 2달 전인 2026-07-01이다.
    expect(computePreviousScheduleDeadline(bimonthly)).toBe('2026-07-01');
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

/**
 * arrival_offset_days가 설정된 정기배송 FIXED_DAY 스케줄 — 실제 "회차별 상세정보" 캡처 데이터로
 * 검증. 도착예정일(anchor='2026-08-03'의 "3일"이 매 N개월마다 반복, 토·일·공휴일이면 다음
 * 영업일로 밀림 — 노동절 제외)이 진짜 고정 앵커고, 결제일은 그 도착일에서 영업일 2일을 거꾸로
 * 센 값이다. 1달 주기(12회차)와 2달 주기(4회차) 두 상품의 실측 데이터가 정확히 이 하나의
 * 규칙으로 설명된다 — 2달 주기 도착일은 1달 주기 도착일 목록의 1·3·5·7번째와 그대로 일치한다.
 */
describe('도착일 고정 앵커 + 결제일 역산 (arrival_offset_days, 실측 데이터 검증)', () => {
  afterEach(() => vi.useRealTimers());

  const monthly = (overrides: Partial<DeadlineRow> = {}) =>
    row('RECURRING_DELIVERY', {
      base_date: '2026-07-30',
      expected_delivery_date: '2026-08-03',
      schedule_type: 'FIXED_DAY',
      fixed_day_interval_months: 1,
      arrival_offset_days: 2,
      ...overrides,
    });

  it('1달 주기 12회차 전부 결제일/도착일이 실측치와 정확히 일치한다', () => {
    // 오늘을 각 회차의 실제 결제일 그날로 설정 — computeDeadline은 항상 "오늘 이후(포함)
    // 가장 가까운" 회차를 반환하므로, 결제일 당일이 정확히 그 회차로 나와야 한다.
    const cases: Array<[string, string, number]> = [
      ['2026-07-30', '2026-08-03', 1],
      ['2026-09-01', '2026-09-03', 2],
      ['2026-10-01', '2026-10-06', 3],
      ['2026-10-30', '2026-11-03', 4],
      ['2026-12-01', '2026-12-03', 5],
      ['2026-12-30', '2027-01-04', 6],
      ['2027-02-01', '2027-02-03', 7],
      ['2027-02-26', '2027-03-03', 8],
      ['2027-04-01', '2027-04-05', 9],
      ['2027-04-29', '2027-05-03', 10], // 2027-05-03: 노동절 대체공휴일이지만 실제 택배는 정상 도착
      ['2027-06-01', '2027-06-03', 11],
      ['2027-07-01', '2027-07-05', 12],
    ];
    for (const [deadlineDay, expectedArrival, expectedRound] of cases) {
      vi.setSystemTime(new Date(`${deadlineDay}T03:00:00.000Z`));
      const purchase = monthly();
      const { deadline, deliveryRound } = computeDeadline(purchase);
      expect([deadlineDay, deadline, deliveryRound]).toEqual([deadlineDay, deadlineDay, expectedRound]);
      expect(computeArrivalEstimate(deadline, purchase.arrival_offset_days)).toBe(expectedArrival);
    }
  });

  it('2달 주기 4회차는 1달 주기의 홀수 회차(1·3·5·7번째)와 도착일이 그대로 겹친다', () => {
    const cases: Array<[string, string, number]> = [
      ['2026-07-30', '2026-08-03', 1],
      ['2026-10-01', '2026-10-06', 2],
      ['2026-12-01', '2026-12-03', 3],
      ['2027-02-01', '2027-02-03', 4],
    ];
    for (const [deadlineDay, expectedArrival, expectedRound] of cases) {
      vi.setSystemTime(new Date(`${deadlineDay}T03:00:00.000Z`));
      const purchase = monthly({ fixed_day_interval_months: 2 });
      const { deadline, deliveryRound } = computeDeadline(purchase);
      expect([deadlineDay, deadline, deliveryRound]).toEqual([deadlineDay, deadlineDay, expectedRound]);
      expect(computeArrivalEstimate(deadline, purchase.arrival_offset_days)).toBe(expectedArrival);
    }
  });

  it('직전 회차(computePreviousScheduleDeadline)도 도착일 고정 기준으로 정확히 되돌아간다', () => {
    vi.setSystemTime(new Date('2026-10-07T03:00:00.000Z')); // 3회차(10/1 결제) 다음날
    const purchase = monthly();
    expect(computeDeadline(purchase).deadline).toBe('2026-10-30');
    // 1개월 전(addMonths 방식)이면 9/30이 나오지만, 실제 직전 회차는 10/1이다.
    expect(computePreviousScheduleDeadline(purchase)).toBe('2026-10-01');
  });
});

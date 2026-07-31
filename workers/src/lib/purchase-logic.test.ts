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

  it('직전 회차가 1회차여도 null이 아니라 1회차 결제일을 정확히 돌려준다', () => {
    // 1회차 결제일(7/30)은 anchor(도착일, 8/3)보다 항상 이르므로 "결제일 >= anchor" 식
    // 가드로는 늘 걸러진다 — 결제일이 아니라 도착일이 신뢰값이라는 실제 사용 사례에 따라
    // 그 가드를 제거했다. 1회차 도착(8/3) 다음날 기준으로 검증한다.
    vi.setSystemTime(new Date('2026-08-04T03:00:00.000Z'));
    const purchase = monthly();
    expect(computeDeadline(purchase).deadline).toBe('2026-09-01');
    expect(computeDeadline(purchase).deliveryRound).toBe(2);
    expect(computePreviousScheduleDeadline(purchase)).toBe('2026-07-30');
  });

  it('결제 다음날이어도 도착 전이면 여전히 1회차를 보여준다(D-day가 앞서가지 않음)', () => {
    // 1회차 결제(7/30) 다음날, 도착(8/3) 전 — "다음 일정"이 벌써 2회차(10/1)로 넘어가
    // 있으면 사용자 눈엔 이제 막 시작한 1회차의 도착예정일이 반영 안 된 것처럼 보인다.
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z'));
    const purchase = monthly();
    expect(computeDeadline(purchase)).toEqual({ deadline: '2026-07-30', deliveryRound: 1 });
    expect(computeArrivalEstimate('2026-07-30', purchase.arrival_offset_days)).toBe('2026-08-03');
  });

  it('도착일 당일까지는 1회차, 그다음 날부터 2회차로 넘어간다', () => {
    vi.setSystemTime(new Date('2026-08-03T03:00:00.000Z')); // 도착 당일
    expect(computeDeadline(monthly()).deliveryRound).toBe(1);
    vi.setSystemTime(new Date('2026-08-04T03:00:00.000Z')); // 도착 다음날
    expect(computeDeadline(monthly()).deliveryRound).toBe(2);
  });
});

describe('INTERVAL(주·일 단위) + arrival_offset_days — 같은 1회차 previous 버그가 없는지', () => {
  afterEach(() => vi.useRealTimers());

  const weekly = (overrides: Partial<DeadlineRow> = {}) =>
    row('RECURRING_DELIVERY', {
      base_date: '2026-07-30',
      expected_delivery_date: '2026-08-03',
      schedule_type: 'INTERVAL',
      interval_days: 28,
      arrival_offset_days: 2,
      ...overrides,
    });

  it('1회차가 아직 다음 일정이면(등록 직후) 직전 회차는 없다(null)', () => {
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z'));
    const purchase = weekly();
    expect(computeDeadline(purchase).deliveryRound).toBe(1);
    expect(computePreviousScheduleDeadline(purchase)).toBeNull();
  });

  it('직전 회차가 1회차여도 null이 아니라 1회차 결제일을 정확히 돌려준다', () => {
    vi.setSystemTime(new Date('2026-08-04T03:00:00.000Z')); // 1회차 도착(8/3) 다음날
    const purchase = weekly();
    expect(computeDeadline(purchase).deliveryRound).toBe(2);
    expect(computePreviousScheduleDeadline(purchase)).toBe('2026-07-30');
  });

  it('2회차 이후 전환은 기존처럼 정상 동작한다(회귀 없음)', () => {
    vi.setSystemTime(new Date('2026-09-01T03:00:00.000Z')); // 2회차가 지난 뒤
    const purchase = weekly();
    const next = computeDeadline(purchase);
    expect(next.deliveryRound).toBeGreaterThanOrEqual(2);
    expect(computePreviousScheduleDeadline(purchase)).not.toBeNull();
  });
});

describe('INTERVAL(주·일 단위) + arrival_offset_days — 원시 도착일이 주말이라 밀리는 회차의 경계', () => {
  afterEach(() => vi.useRealTimers());

  // anchor(2026-08-01)가 토요일 — 원시 도착일은 토요일, 실제(영업일 보정) 도착일은 다음 월요일(8/3).
  const weeklySaturdayAnchor = () =>
    row('RECURRING_DELIVERY', {
      base_date: '2026-08-01',
      expected_delivery_date: '2026-08-01',
      schedule_type: 'INTERVAL',
      interval_days: 7,
      arrival_offset_days: 2,
    });

  it('원시 도착일(토)과 그 다음날(일)에도 실제 도착 전이라 여전히 1회차', () => {
    vi.setSystemTime(new Date('2026-08-01T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor()).deliveryRound).toBe(1);
    vi.setSystemTime(new Date('2026-08-02T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor()).deliveryRound).toBe(1);
  });

  it('실제(영업일 보정된) 도착일 당일(월)까지는 1회차, 다음날(화)부터 2회차', () => {
    vi.setSystemTime(new Date('2026-08-03T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor()).deliveryRound).toBe(1);
    vi.setSystemTime(new Date('2026-08-04T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor()).deliveryRound).toBe(2);
  });
});

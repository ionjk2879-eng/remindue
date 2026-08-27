import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PurchaseRow, PurchaseType } from '../types';
import {
  InvalidPurchaseOperationError,
  arrivalAnchor,
  computeArrivalEstimate,
  computeDeadline,
  computeDeadlineAt,
  computeDeadlines,
  computePreviousScheduleDeadline,
  computeStatusLabel,
  confirmReceiptToday,
  isPastDueUnconfirmed,
  isValidArrivalDaysAgo,
  lastReachedRound,
  recomputeRoundOffsetForEdit,
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

function row(type: PurchaseType, overrides: Partial<DeadlineRow & { delivery_round_offset: number }> = {}): DeadlineRow & { delivery_round_offset?: number } {
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

  it('subtracts paused cycles from the visible round without moving the vendor schedule', () => {
    const recurring = row('SUBSCRIPTION', {
      base_date: '2026-07-01',
      interval_days: 10,
      delivery_round_offset: 2,
    });
    expect(computeDeadline(recurring)).toEqual({ deadline: '2026-07-31', deliveryRound: 2 });
    expect(computeDeadlineAt(recurring, '2026-07-11')).toEqual({ deadline: '2026-07-11', deliveryRound: 1 });
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
    // 도착예정일은 토요일도 배송일로 인정한다(isNonDeliveryDay) — 결제일 역산은 여전히
    // 월~금만 영업일로 세므로(isNonBusinessDay) 결제일/회차 값 자체는 바뀌지 않는다.
    const cases: Array<[string, string, number]> = [
      ['2026-07-30', '2026-08-01', 1],
      ['2026-09-01', '2026-09-03', 2],
      ['2026-10-01', '2026-10-06', 3],
      ['2026-10-30', '2026-11-02', 4],
      ['2026-12-01', '2026-12-03', 5],
      ['2026-12-30', '2027-01-02', 6],
      ['2027-02-01', '2027-02-03', 7],
      ['2027-02-26', '2027-03-02', 8],
      ['2027-04-01', '2027-04-03', 9],
      ['2027-04-29', '2027-05-01', 10],
      ['2027-06-01', '2027-06-03', 11],
      ['2027-07-01', '2027-07-03', 12],
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
      ['2026-07-30', '2026-08-01', 1],
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

  it('결제 다음날부터는 도착 전이어도 바로 다음 회차로 넘어간다(회차 갱신은 결제일 기준)', () => {
    // RECURRING_DELIVERY는 실제 도착 여부를 더 이상 묻지 않으므로(arrival-confirm.ts는
    // GENERAL 전용) 회차 갱신도 도착일이 아니라 결제일 기준이다 — 1회차 결제(7/30) 다음날엔
    // 아직 도착(8/3) 전이어도 이미 2회차(다음 결제 9/1)를 "다음 일정"으로 보여준다.
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z'));
    const purchase = monthly();
    expect(computeDeadline(purchase)).toEqual({ deadline: '2026-09-01', deliveryRound: 2 });
  });

  it('결제일 당일까지는 1회차, 그다음 날부터 2회차로 넘어간다', () => {
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z')); // 결제 당일
    expect(computeDeadline(monthly()).deliveryRound).toBe(1);
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z')); // 결제 다음날
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

describe('INTERVAL(주·일 단위) + arrival_offset_days — 토요일 원시 도착일은 보정 없이 그대로 유효하다', () => {
  afterEach(() => vi.useRealTimers());

  // anchor(2026-08-01)가 토요일 — 이제 토요일도 배송일이라 월요일로 밀리지 않고 그대로 도착일로 쓰인다.
  const weeklySaturdayAnchor = () =>
    row('RECURRING_DELIVERY', {
      base_date: '2026-08-01',
      expected_delivery_date: '2026-08-01',
      schedule_type: 'INTERVAL',
      interval_days: 7,
      arrival_offset_days: 2,
    });

  it('결제일(목) 당일까지는 1회차, 다음날(금)부터 2회차로 넘어간다(회차 갱신은 결제일 기준)', () => {
    // 도착일(토, 8/1)은 아직 한참 남았어도 1회차 결제일(7/30, 목) 다음날이면 바로 2회차로
    // 넘어간다 — RECURRING_DELIVERY는 실제 도착 여부를 더 이상 묻지 않으므로(arrival-confirm.ts는
    // GENERAL 전용) 도착 전이라는 이유로 회차를 붙들고 있을 필요가 없다.
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor())).toEqual({ deadline: '2026-07-30', deliveryRound: 1 });
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor())).toEqual({ deadline: '2026-08-06', deliveryRound: 2 });
  });

  it('2회차 결제일(8/6)까지는 유지되고, 그 다음날 다시 3회차로 넘어간다', () => {
    vi.setSystemTime(new Date('2026-08-06T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor()).deliveryRound).toBe(2);
    vi.setSystemTime(new Date('2026-08-07T03:00:00.000Z'));
    expect(computeDeadline(weeklySaturdayAnchor())).toEqual({ deadline: '2026-08-13', deliveryRound: 3 });
  });
});

describe('isPastDueUnconfirmed — 마지막 회차가 결제일로부터 1주일까지 미확인이면 지난 항목으로 취급', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-07-27T03:00:00.000Z')));
  afterEach(() => vi.useRealTimers());

  const overdueSubscription = (overrides: Partial<{ delivery_confirm_count: number; renewal_decision_for: string | null; discontinued_at: string | null; is_one_time: number }> = {}) => ({
    ...row('SUBSCRIPTION', { base_date: '2026-06-01', interval_days: 30 }),
    delivery_confirm_count: 0,
    renewal_decision_for: null,
    discontinued_at: null,
    ...overrides,
  });

  it('직전 회차 결제일로부터 1주일 넘게 미확인이면 true', () => {
    expect(isPastDueUnconfirmed(overdueSubscription())).toBe(true);
  });

  it('이미 그 회차를 확인했으면(delivery_confirm_count가 따라잡음) false', () => {
    expect(isPastDueUnconfirmed(overdueSubscription({ delivery_confirm_count: 2 }))).toBe(false);
  });

  it('"유지 안 함"으로 이미 명시했으면 false — discontinuedAt 쪽 판정과 겹치지 않는다', () => {
    expect(isPastDueUnconfirmed(overdueSubscription({ discontinued_at: '2026-07-01 00:00:00' }))).toBe(false);
  });

  it('1회성 항목은 false — dDay<0 판정을 따로 쓴다', () => {
    expect(isPastDueUnconfirmed(overdueSubscription({ is_one_time: 1 }))).toBe(false);
  });

  it('최근에 시작한 항목(아직 1주일 안 지남)은 false', () => {
    expect(isPastDueUnconfirmed({ ...overdueSubscription(), base_date: '2026-07-25' })).toBe(false);
  });
});

describe('recomputeRoundOffsetForEdit — 항목 수정으로 시작일/스케줄이 바뀌어도 표시 회차는 그대로', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-01T03:00:00.000Z')));
  afterEach(() => vi.useRealTimers());

  it('시작일만 최근으로 당겨도 회차 번호가 유지되도록 오프셋을 보정한다', () => {
    const existing = row('SUBSCRIPTION', { base_date: '2026-01-26', fixed_day_of_month: 26, schedule_type: 'FIXED_DAY' });
    const previousRound = computeDeadline(existing).deliveryRound;

    const updated = { ...existing, base_date: '2026-08-25', fixed_day_of_month: 26 };
    const offset = recomputeRoundOffsetForEdit(existing, updated);

    expect(computeDeadline({ ...updated, delivery_round_offset: offset }).deliveryRound).toBe(previousRound);
  });

  it('스케줄이 안 바뀌면 오프셋도 그대로(무변화)', () => {
    const existing = { ...row('RECURRING_DELIVERY', { base_date: '2026-01-01', interval_days: 14 }), delivery_round_offset: 3 };
    expect(recomputeRoundOffsetForEdit(existing, existing)).toBe(3);
  });
});

describe('lastReachedRound — 재구독 시 회차를 이어붙일 기준점', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-09-01T03:00:00.000Z')));
  afterEach(() => vi.useRealTimers());

  it('"유지 안 함"으로 명시 중단됐으면 그 순간 얼려둔 discontinued_round를 쓴다', () => {
    const stopped = {
      ...row('SUBSCRIPTION', { base_date: '2026-01-01', interval_days: 30 }),
      discontinued_at: '2026-06-01 00:00:00',
      discontinued_round: 5,
    };
    expect(lastReachedRound(stopped)).toBe(5);
  });

  it('discontinued_round이 비어 있으면 중단 시점 기준으로 재계산한다', () => {
    const stopped = {
      ...row('SUBSCRIPTION', { base_date: '2026-01-01', interval_days: 30 }),
      discontinued_at: '2026-06-01 00:00:00',
      discontinued_round: null,
    };
    expect(lastReachedRound(stopped)).toBe(computeDeadlineAt(stopped, '2026-06-01').deliveryRound);
  });

  it('명시적 중단이 아니면(미확인 만료 등) 오늘 기준 현재 회차를 쓴다', () => {
    const lapsed = {
      ...row('SUBSCRIPTION', { base_date: '2026-01-01', interval_days: 30 }),
      discontinued_at: null,
      discontinued_round: null,
    };
    expect(lastReachedRound(lapsed)).toBe(computeDeadline(lapsed).deliveryRound);
  });
});

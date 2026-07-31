import { describe, it, expect, vi, afterEach } from 'vitest';
import { toPurchaseResponse } from './mapper';
import type { PurchaseRow } from '../types';

function row(overrides: Partial<PurchaseRow> = {}): PurchaseRow {
  return {
    id: 1,
    user_id: 1,
    type: 'RECURRING_DELIVERY',
    item_name: '테스트 상품',
    base_date: '2026-07-30',
    amount: 10000,
    memo: null,
    warranty_months: null,
    return_deadline_days: null,
    interval_days: null,
    schedule_type: 'FIXED_DAY',
    fixed_day_of_month: 3,
    fixed_day_interval_months: 1,
    is_one_time: 0,
    last_delivered_date: null,
    expected_delivery_date: '2026-08-03',
    arrival_offset_days: 2,
    arrival_check_snoozed_until: null,
    delivery_confirm_count: 0,
    discontinued_at: null,
    stop_after_current_at: null,
    renewal_decision_for: null,
    deadline_notifications_disabled_at: null,
    archived_at: null,
    discarded_at: null,
    category: null,
    category_tags: null,
    brand: null,
    brand_domain: null,
    original_amount: null,
    original_currency: null,
    exchange_rate: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  } as PurchaseRow;
}

describe('toPurchaseResponse — awaitingArrival(결제완료·도착대기) 판정과 dDay 기준 전환', () => {
  afterEach(() => vi.useRealTimers());

  it('결제일 전에는 결제일 기준 dDay, awaitingArrival=false', () => {
    vi.setSystemTime(new Date('2026-07-29T03:00:00.000Z')); // 결제(7/30) 전날
    const res = toPurchaseResponse(row());
    expect(res.awaitingArrival).toBe(false);
    expect(res.deadline).toBe('2026-07-30');
    expect(res.dDay).toBe(1); // 결제일까지 D-1
  });

  it('결제일 당일엔 아직 awaitingArrival=false(오늘 결제 D-DAY 그대로)', () => {
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z'));
    const res = toPurchaseResponse(row());
    expect(res.awaitingArrival).toBe(false);
    expect(res.dDay).toBe(0);
  });

  it('결제 다음날(도착 전)엔 awaitingArrival=true, dDay는 도착일 기준으로 바뀐다', () => {
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z')); // 결제(7/30) 다음날, 도착(8/3) 전
    const res = toPurchaseResponse(row());
    expect(res.awaitingArrival).toBe(true);
    expect(res.deliveryRound).toBe(1);
    expect(res.arrivalEstimate).toBe('2026-08-03');
    expect(res.dDay).toBe(3); // 도착일까지 D-3 (결제일 기준이면 음수/지남이었을 값)
    // paymentDDay는 awaitingArrival과 무관하게 항상 결제일(7/30) 기준으로 음수로 남아있어야
    // "이번 주 결제 예정"/"유지하기" 버튼 노출 같은 결제 판정 로직이 이미 지난 결제를
    // 다시 "예정"으로 잘못 집계하지 않는다.
    expect(res.paymentDDay).toBe(-1);
  });

  it('도착일이 지나 다음 회차로 넘어가면 다시 결제일 기준(awaitingArrival=false)', () => {
    vi.setSystemTime(new Date('2026-08-04T03:00:00.000Z')); // 도착(8/3) 다음날 -> 2회차
    const res = toPurchaseResponse(row());
    expect(res.awaitingArrival).toBe(false);
    expect(res.deliveryRound).toBe(2);
    expect(res.deadline).toBe('2026-09-01');
    expect(res.dDay).toBe(28); // 2회차 결제일까지 D-28
  });

  it('arrival_offset_days가 없는 항목은 결제 다음날이어도 awaitingArrival=false(도착 개념 자체가 없음)', () => {
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z'));
    const res = toPurchaseResponse(row({ arrival_offset_days: null }));
    expect(res.awaitingArrival).toBe(false);
    expect(res.arrivalEstimate).toBeNull();
  });
});

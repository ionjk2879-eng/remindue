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

describe('toPurchaseResponse — dDay는 항상 paymentDDay와 같고, 도착 예상은 참고용 범위(arrivalRangeEstimate)로만 노출된다', () => {
  afterEach(() => vi.useRealTimers());

  it('결제일 전에는 결제일까지 D-day', () => {
    vi.setSystemTime(new Date('2026-07-29T03:00:00.000Z')); // 결제(7/30) 전날
    const res = toPurchaseResponse(row());
    expect(res.deadline).toBe('2026-07-30');
    expect(res.dDay).toBe(1);
    expect(res.paymentDDay).toBe(1);
  });

  it('결제 다음날에도 dDay는 결제일 기준 그대로다(도착 대기로 갈라지지 않음)', () => {
    vi.setSystemTime(new Date('2026-07-31T03:00:00.000Z')); // 결제(7/30) 다음날
    const res = toPurchaseResponse(row());
    expect(res.dDay).toBe(res.paymentDDay);
    expect(res.dDay).toBe(-1);
  });

  it('RECURRING_DELIVERY는 arrival_offset_days 설정 여부와 무관하게 항상 도착 예상 범위를 돌려준다', () => {
    vi.setSystemTime(new Date('2026-07-29T03:00:00.000Z'));
    const withOffset = toPurchaseResponse(row());
    expect(withOffset.deadline).toBe('2026-07-30'); // 목요일
    expect(withOffset.arrivalRangeEstimate).toEqual({ from: '2026-07-31', to: '2026-08-01' }); // 금~토

    // fixed_day_of_month(3)를 base_date(30)와 맞춰서 arrival_offset_days=null 경로에서도
    // 같은 결제일(7/30)이 나오게 한다 — 오프셋 여부와 무관하게 범위 계산 자체를 검증하려는 것.
    const withoutOffset = toPurchaseResponse(
      row({ arrival_offset_days: null, fixed_day_of_month: 30, expected_delivery_date: null })
    );
    expect(withoutOffset.deadline).toBe('2026-07-30');
    expect(withoutOffset.arrivalRangeEstimate).toEqual({ from: '2026-07-31', to: '2026-08-01' });
  });

  it('SUBSCRIPTION/GENERAL은 arrivalRangeEstimate가 항상 null이다', () => {
    vi.setSystemTime(new Date('2026-07-29T03:00:00.000Z'));
    expect(toPurchaseResponse(row({ type: 'SUBSCRIPTION' })).arrivalRangeEstimate).toBeNull();
    expect(toPurchaseResponse(row({ type: 'GENERAL', schedule_type: 'INTERVAL' })).arrivalRangeEstimate).toBeNull();
  });

  it('금요일 결제면 도착 예상 범위는 토~월이다(일요일은 건너뜀)', () => {
    vi.setSystemTime(new Date('2027-01-28T03:00:00.000Z')); // 2027-01-29은 금요일
    const res = toPurchaseResponse(
      row({ base_date: '2027-01-29', expected_delivery_date: null, fixed_day_of_month: 29, arrival_offset_days: null })
    );
    expect(res.deadline).toBe('2027-01-29');
    expect(res.arrivalRangeEstimate).toEqual({ from: '2027-01-30', to: '2027-02-01' });
  });
});

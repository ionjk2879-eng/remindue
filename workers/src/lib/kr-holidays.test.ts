import { describe, expect, it } from 'vitest';
import { isNonBusinessDay, isNonDeliveryDay } from './kr-holidays';

describe('isNonDeliveryDay (도착일 계산 전용 — 토요일은 배송일)', () => {
  it('flags Sunday but not Saturday', () => {
    expect(isNonDeliveryDay('2026-08-01')).toBe(false); // 토요일 — 택배는 정상 배송
    expect(isNonDeliveryDay('2026-08-02')).toBe(true); // 일요일
    expect(isNonDeliveryDay('2026-08-03')).toBe(false); // 월요일
  });

  it('flags real substitute-holiday cases found in actual store schedules', () => {
    expect(isNonDeliveryDay('2026-10-05')).toBe(true); // 개천절 대체공휴일
    expect(isNonDeliveryDay('2027-03-01')).toBe(true); // 삼일절
    expect(isNonDeliveryDay('2027-08-16')).toBe(true); // 광복절 대체공휴일
  });

  it('does not flag an ordinary weekday', () => {
    expect(isNonDeliveryDay('2026-07-30')).toBe(false); // 목요일, 공휴일 아님
  });

  it('does not flag Labor Day (노동절) or its substitute — real courier/delivery data shows deliveries proceed as normal', () => {
    expect(isNonDeliveryDay('2026-05-01')).toBe(false); // 노동절(금요일)
    expect(isNonDeliveryDay('2027-05-03')).toBe(false); // 노동절 대체공휴일(월요일) — 실제 정기배송이 이 날 그대로 도착 처리됨
  });
});

describe('isNonBusinessDay (결제일 역산 전용 — 토요일도 쉼)', () => {
  it('flags weekends', () => {
    expect(isNonBusinessDay('2026-08-01')).toBe(true); // 토요일
    expect(isNonBusinessDay('2026-08-02')).toBe(true); // 일요일
    expect(isNonBusinessDay('2026-08-03')).toBe(false); // 월요일
  });

  it('flags real substitute-holiday cases found in actual store schedules', () => {
    expect(isNonBusinessDay('2026-10-05')).toBe(true); // 개천절 대체공휴일
    expect(isNonBusinessDay('2027-03-01')).toBe(true); // 삼일절
  });

  it('does not flag an ordinary weekday', () => {
    expect(isNonBusinessDay('2026-07-30')).toBe(false); // 목요일, 공휴일 아님
  });
});

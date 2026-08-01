import { describe, expect, it } from 'vitest';
import { addBusinessDays, addDays, addMonths, daysBetween, nextFixedDayEveryNMonths, nextFixedDayOfMonth } from './date';
import { isNonDeliveryDay } from './kr-holidays';

describe('date helpers', () => {
  it('handles leap days and year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('clamps month addition to the last valid day', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('finds the nearest fixed day and clamps short months', () => {
    expect(nextFixedDayOfMonth(31, '2026-02-10')).toBe('2026-02-28');
    expect(nextFixedDayOfMonth(15, '2026-07-15')).toBe('2026-07-15');
    expect(nextFixedDayOfMonth(15, '2026-07-16')).toBe('2026-08-15');
  });

  it('nextFixedDayEveryNMonths matches nextFixedDayOfMonth when interval is 1 month', () => {
    for (const [day, today] of [
      [31, '2026-02-10'],
      [15, '2026-07-15'],
      [15, '2026-07-16'],
    ] as const) {
      expect(nextFixedDayEveryNMonths(day, 1, '2025-01-01', today)).toBe(nextFixedDayOfMonth(day, today));
    }
  });

  it('nextFixedDayEveryNMonths reproduces the real 2-month store schedule once anchored to a steady-state round', () => {
    // 실제 캡처: 1회차 결제 26.07.30(신규가입 — 날짜가 튀는 회차)만 지나면 2회차 26.10.01, 3회차
    // 26.12.01, 4회차 27.02.01로 "매월 1일, 2개월 간격"이 안정된다. 신규가입일(7/30)을 앵커로 쓰면
    // 다음 후보 월이 September가 될 수도 있어(2개월씩 세는 기준월 자체가 달라짐), 실제 이 앱에서는
    // "도착 확인" 시 expected_delivery_date가 실제 확정일로 재조정되는 기존 자기보정
    // (arrivalAnchor, purchase-logic.ts 상단 주석 참고)이 1~2회차 만에 안정된 앵커로 맞춰준다 —
    // 그래서 안정된 이후의 앵커(10/1)로 검증한다.
    expect(nextFixedDayEveryNMonths(1, 2, '2026-10-01', '2026-10-02')).toBe('2026-12-01');
    expect(nextFixedDayEveryNMonths(1, 2, '2026-10-01', '2026-12-02')).toBe('2027-02-01');
  });
});

describe('addBusinessDays (실제 정기배송 도착예정일 사례 검증 — 토요일도 배송일로 인정)', () => {
  it('matches the 2-month store schedule captures exactly, including a substitute-holiday round', () => {
    expect(addBusinessDays('2026-07-30', 2, isNonDeliveryDay)).toBe('2026-08-01'); // 목→토(실제 관측치)
    expect(addBusinessDays('2026-10-01', 2, isNonDeliveryDay)).toBe('2026-10-06'); // 10/5 대체공휴일 스킵
    expect(addBusinessDays('2026-12-01', 2, isNonDeliveryDay)).toBe('2026-12-03');
    expect(addBusinessDays('2027-02-01', 2, isNonDeliveryDay)).toBe('2027-02-03');
  });

  it('matches the 6-week store schedule captures, including a substitute-holiday round', () => {
    expect(addBusinessDays('2026-07-30', 2, isNonDeliveryDay)).toBe('2026-08-01');
    expect(addBusinessDays('2026-09-10', 2, isNonDeliveryDay)).toBe('2026-09-12');
    expect(addBusinessDays('2027-02-25', 2, isNonDeliveryDay)).toBe('2027-02-27');
    expect(addBusinessDays('2027-08-12', 2, isNonDeliveryDay)).toBe('2027-08-14'); // 8/15 광복절 스킵
  });

  it('matches the 4-week store schedule captures (steady-state rounds, offset stays 2 business days)', () => {
    expect(addBusinessDays('2026-08-28', 2, isNonDeliveryDay)).toBe('2026-08-31');
    expect(addBusinessDays('2026-10-23', 2, isNonDeliveryDay)).toBe('2026-10-26');
    expect(addBusinessDays('2026-11-20', 2, isNonDeliveryDay)).toBe('2026-11-23');
  });
});

import { describe, expect, it } from 'vitest';
import { parseCurUnit, parseCommaNumber } from './eximbank';

describe('parseCurUnit', () => {
  it('배수가 붙은 통화 단위를 코드와 배수로 분리한다(엔화 등 저액면 통화)', () => {
    expect(parseCurUnit('JPY(100)')).toEqual({ code: 'JPY', perUnits: 100 });
    expect(parseCurUnit('IDR(100)')).toEqual({ code: 'IDR', perUnits: 100 });
  });

  it('배수가 없으면 그대로 배수 1을 붙인다', () => {
    expect(parseCurUnit('USD')).toEqual({ code: 'USD', perUnits: 1 });
  });
});

describe('parseCommaNumber', () => {
  it('콤마 포함 숫자 문자열을 파싱한다', () => {
    expect(parseCommaNumber('1,441.1')).toBe(1441.1);
    expect(parseCommaNumber('902.13')).toBe(902.13);
  });

  it('숫자가 아니면 null', () => {
    expect(parseCommaNumber('N/A')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { applyCardFee } from './fx-card';

describe('applyCardFee', () => {
  it('토스뱅크+마스터카드 실측 검증: $5.50 결제가 실제 청구액(8,822원)에 근접한다', () => {
    // 2026-08-01 Frankfurter 매매기준율(USD/KRW) 근사치. 실제 청구액과의 오차가 1% 이내로
    // 나와야 한다 — DCC가 아니라 브랜드수수료+고정수수료+전신환매도율 스프레드로 설명된다는
    // 실측 역산 결과.
    const baseRate = 1437.12;
    const amount = applyCardFee(5.5, baseRate, 'TOSS', 'MASTER');
    const actualCharge = 8822;
    expect(Math.abs(amount - actualCharge) / actualCharge).toBeLessThan(0.01);
  });

  it('트래블월렛류는 매매기준율 그대로(수수료 0%)', () => {
    expect(applyCardFee(100, 1000, 'TRAVEL', 'MASTER')).toBe(100_000);
    // 브랜드를 뭘 선택해도 트래블 카드는 결과가 같다(수수료 자체가 없으므로).
    expect(applyCardFee(100, 1000, 'TRAVEL', 'VISA')).toBe(100_000);
  });

  it('카드 미설정(null)이면 평균 마진(2.5%) 근사치로 계산한다', () => {
    expect(applyCardFee(100, 1000, null, null)).toBe(102_500);
  });

  it('일반 카드사(신한/현대/카카오페이/네이버페이)는 브랜드수수료+카드사수수료 표준 공식을 쓴다', () => {
    const baseRate = 1000;
    const shinhan = applyCardFee(100, baseRate, 'SHINHAN', 'VISA');
    const hyundai = applyCardFee(100, baseRate, 'HYUNDAI', 'VISA');
    // 같은 브랜드면 표준 공식을 쓰는 카드사끼리는 결과가 같다.
    expect(shinhan).toBe(hyundai);
    // 매매기준율 그대로(100,000원)보다는 커야 한다(수수료가 붙으므로).
    expect(shinhan).toBeGreaterThan(100_000);
  });

  it('실제 전신환매도율(realTtSellingRate)이 주어지면 그 값을 그대로 쓰고 스프레드 근사는 무시한다', () => {
    // 2026-07-31 실측(한국수출입은행 API): 매매기준율 1441.1, 전신환매도율 1455.51.
    const amount = applyCardFee(5.5, 1441.1, 'TOSS', 'MASTER', 1455.51);
    // totalForeign = 5.5*1.01 + 0.5 = 6.055, 6.055 * 1455.51 = 8811.9...
    expect(amount).toBe(Math.round(6.055 * 1455.51));
  });

  it('브랜드별 수수료율 차이가 결과에 반영된다(Amex > Visa > Master)', () => {
    const baseRate = 1000;
    const master = applyCardFee(1000, baseRate, 'SHINHAN', 'MASTER');
    const visa = applyCardFee(1000, baseRate, 'SHINHAN', 'VISA');
    const amex = applyCardFee(1000, baseRate, 'SHINHAN', 'AMEX');
    expect(master).toBeLessThan(visa);
    expect(visa).toBeLessThan(amex);
  });

  it('reproduces the known USD Toss Mastercard charge', () => {
    expect(applyCardFee(5.5, 1457, 'TOSS', 'MASTER', 1457, 1457)).toBe(8_822);
  });

  it('converts the Toss fixed fee with USD tts for a JPY purchase', () => {
    const jpyTtsPerYen = 9.4;
    const usdTts = 1457;
    const expected = Math.round(1500 * jpyTtsPerYen * 1.01 + 0.5 * usdTts);

    expect(applyCardFee(1500, 9.3, 'TOSS', 'MASTER', jpyTtsPerYen, usdTts)).toBe(expected);
  });
});

// 해외결제 카드 수수료 근사 계산 — Frankfurter 매매기준율만으로는 실제 카드 청구액과 최대
// 10%+ 차이가 날 수 있다(브랜드 수수료 + 카드사 수수료 + 전신환매도율 스프레드가 안 잡혀서).
// 실측(토스뱅크 마스터카드, $5.50 결제 -> 실제 8,822원)으로 역산 검증한 결과, DCC 같은 예측
// 불가능한 변수가 아니라 "브랜드 수수료율 + 카드사별 고정 공식 + 전신환매도율 스프레드"만으로
// 오차 1% 이내까지 설명됐다 — 그래서 카드사를 선택하면 이 공식으로 근사치를 계산해준다.
//
// 전신환매도율(TT selling rate)은 이제 한국수출입은행 API(lib/eximbank.ts)로 실제 값을 구해서
// realTtSellingRate로 넘겨받는다 — 그게 없을 때만(API 실패·통화 미지원 등) 매매기준율 대비
// 고정 스프레드로 근사한다. 이 스프레드 기본값(1.4%)은 위 실측 역산 결과이자, 실제 API 데이터로
// 확인한 USD 스프레드(2026-07-31 기준 1441.1 -> 1455.51, 약 1.0%)와도 비슷한 범위다.
const TT_SELLING_SPREAD = 0.014;

export type FxCardIssuer = 'TOSS' | 'KAKAOPAY' | 'NAVERPAY_HANA' | 'TRAVEL' | 'SHINHAN' | 'HYUNDAI';
export type FxCardBrand = 'MASTER' | 'VISA' | 'AMEX';

export const FX_CARD_ISSUERS: FxCardIssuer[] = ['TOSS', 'KAKAOPAY', 'NAVERPAY_HANA', 'TRAVEL', 'SHINHAN', 'HYUNDAI'];
export const FX_CARD_BRANDS: FxCardBrand[] = ['MASTER', 'VISA', 'AMEX'];

/** 국제 브랜드사가 가맹점 결제망 통과 시 떼는 수수료율 — Master/Visa/Amex 공개 수수료 체계 기준. */
const BRAND_FEE_RATE: Record<FxCardBrand, number> = { MASTER: 0.01, VISA: 0.011, AMEX: 0.014 };
/** 브랜드 미설정 시 폴백 — 국내 발급 카드 대다수가 Mastercard/Visa라 그 중 낮은 쪽(Master)을 기본값으로 쓴다. */
const DEFAULT_BRAND_FEE_RATE = BRAND_FEE_RATE.MASTER;
/** 신한/현대 등 국내 카드사 평균 해외서비스수수료 — 브랜드 수수료와 별개로 카드사가 추가로 떼는 몫. */
const STANDARD_ISSUER_FEE_RATE = 0.002;
/** 카드 미설정("기타") 시 폴백 — 매매기준율 대비 평균적으로 붙는 마진 근사치. */
const DEFAULT_MARKUP_RATE = 0.025;

export function estimateTtSellingRate(baseRate: number): number {
  return baseRate * (1 + TT_SELLING_SPREAD);
}

/**
 * 카드사·브랜드별 해외결제 원화 환산 — issuer가 null(카드 미설정)이면 평균 마진 근사치로 폴백한다.
 * baseRate: 매매기준율(원화 결제 통화 1단위 = N원) — 한국수출입은행 API를 우선 쓰고, 실패하면
 * Frankfurter로 폴백한다(호출부 convertToKrw 참고).
 * realTtSellingRate: 한국수출입은행 API가 준 실제 전신환매도율이 있으면 그대로 쓰고, 없으면
 * baseRate에 고정 스프레드(TT_SELLING_SPREAD)를 얹어 근사한다.
 */
export function applyCardFee(
  originalAmount: number,
  baseRate: number,
  issuer: FxCardIssuer | null,
  brand: FxCardBrand | null,
  realTtSellingRate: number | null = null,
  usdTtSellingRate: number | null = null
): number {
  if (issuer === null) {
    return Math.round(originalAmount * baseRate * (1 + DEFAULT_MARKUP_RATE));
  }

  // 트래블월렛/트래블로그/신한 SOL트래블 — "환전수수료 0원"이 상품 자체의 핵심 특징이라
  // 매매기준율을 그대로 쓴다(브랜드 수수료·카드사 수수료 없음).
  if (issuer === 'TRAVEL') {
    return Math.round(originalAmount * baseRate);
  }

  const ttSellingRate = realTtSellingRate ?? estimateTtSellingRate(baseRate);
  const brandFeeRate = brand !== null ? BRAND_FEE_RATE[brand] : DEFAULT_BRAND_FEE_RATE;

  if (issuer === 'TOSS') {
    // Mastercard 수수료는 승인 통화의 tts로 계산한다. 토스뱅크의 고정 해외서비스 수수료는
    // 원거래 통화와 무관하게 US$0.50이므로, 비USD 결제에서는 같은 결제일의 USD tts로 별도 환산한다.
    const baseKrw = originalAmount * ttSellingRate;
    const brandFeeKrw = baseKrw * brandFeeRate;
    const fixedTossFeeKrw = 0.5 * (usdTtSellingRate ?? ttSellingRate);
    return Math.round(baseKrw + brandFeeKrw + fixedTossFeeKrw);
  }

  // 카카오페이/네이버페이(하나카드)/신한카드/현대카드 — 표준 공식(브랜드 수수료 + 카드사 평균 수수료).
  const totalForeign = originalAmount * (1 + brandFeeRate) * (1 + STANDARD_ISSUER_FEE_RATE);
  return Math.round(totalForeign * ttSellingRate);
}

/**
 * 이미 확정된 원화 청구액에서 같은 결제를 수수료 없는 트래블 카드로 결제했을 금액을 역산한다.
 * UI가 카드사 수수료 공식을 복제하지 않도록 이 계산은 서버에서만 수행한다.
 */
export function estimateTravelCardAmount(
  currentAmount: number,
  originalAmount: number,
  issuer: FxCardIssuer | null,
  brand: FxCardBrand | null,
): number | null {
  if (issuer === null || issuer === 'TRAVEL') return null;
  const brandFeeRate = brand !== null ? BRAND_FEE_RATE[brand] : DEFAULT_BRAND_FEE_RATE;
  if (issuer === 'TOSS') {
    return Math.round(
      (currentAmount * originalAmount)
      / ((originalAmount * (1 + brandFeeRate) + 0.5) * (1 + TT_SELLING_SPREAD)),
    );
  }
  return Math.round(
    currentAmount / ((1 + brandFeeRate) * (1 + STANDARD_ISSUER_FEE_RATE) * (1 + TT_SELLING_SPREAD)),
  );
}

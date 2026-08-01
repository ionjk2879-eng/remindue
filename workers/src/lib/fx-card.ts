// 해외결제 카드 수수료 근사 계산 — Frankfurter 매매기준율만으로는 실제 카드 청구액과 최대
// 10%+ 차이가 날 수 있다(브랜드 수수료 + 카드사 수수료 + 전신환매도율 스프레드가 안 잡혀서).
// 실측(토스뱅크 마스터카드, $5.50 결제 -> 실제 8,822원)으로 역산 검증한 결과, DCC 같은 예측
// 불가능한 변수가 아니라 "브랜드 수수료율 + 카드사별 고정 공식 + 전신환매도율 스프레드"만으로
// 오차 1% 이내까지 설명됐다 — 그래서 카드사를 선택하면 이 공식으로 근사치를 계산해준다.
//
// 전신환매도율(TT selling rate)은 실제 은행 API(예: 한국수출입은행) 없이 근사한다 — 매매기준율
// 대비 스프레드를 고정값으로 가정한다. 위 실측 역산 결과 필요한 스프레드가 1.38%로 나왔고,
// USD 전신환매도율 스프레드로 흔히 알려진 범위(1~2%)와 일치해 이 값을 기본으로 쓴다.
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

function estimateTtSellingRate(baseRate: number): number {
  return baseRate * (1 + TT_SELLING_SPREAD);
}

/**
 * 카드사·브랜드별 해외결제 원화 환산 — issuer가 null(카드 미설정)이면 평균 마진 근사치로 폴백한다.
 * baseRate: Frankfurter 매매기준율 근사치(원화 결제 통화 1단위 = N원).
 */
export function applyCardFee(
  originalAmount: number,
  baseRate: number,
  issuer: FxCardIssuer | null,
  brand: FxCardBrand | null
): number {
  if (issuer === null) {
    return Math.round(originalAmount * baseRate * (1 + DEFAULT_MARKUP_RATE));
  }

  // 트래블월렛/트래블로그/신한 SOL트래블 — "환전수수료 0원"이 상품 자체의 핵심 특징이라
  // 매매기준율을 그대로 쓴다(브랜드 수수료·카드사 수수료 없음).
  if (issuer === 'TRAVEL') {
    return Math.round(originalAmount * baseRate);
  }

  const ttSellingRate = estimateTtSellingRate(baseRate);
  const brandFeeRate = brand !== null ? BRAND_FEE_RATE[brand] : DEFAULT_BRAND_FEE_RATE;

  if (issuer === 'TOSS') {
    // 토스뱅크 카드 — 브랜드 수수료에 더해 고정 0.5(외화 단위) 수수료가 별도로 붙는다.
    const totalForeign = originalAmount * (1 + brandFeeRate) + 0.5;
    return Math.round(totalForeign * ttSellingRate);
  }

  // 카카오페이/네이버페이(하나카드)/신한카드/현대카드 — 표준 공식(브랜드 수수료 + 카드사 평균 수수료).
  const totalForeign = originalAmount * (1 + brandFeeRate) * (1 + STANDARD_ISSUER_FEE_RATE);
  return Math.round(totalForeign * ttSellingRate);
}

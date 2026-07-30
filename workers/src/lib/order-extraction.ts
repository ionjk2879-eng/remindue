// 이메일 포워딩(email-extract.ts)으로 들어온 메일의 주문확인 판별 + 핵심 필드 추출 로직.
// SDK 없이 fetch로 Claude Messages API를 직접 호출한다(email.ts의 Resend REST 호출과 같은 패턴).

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// 분류 + 짧은 필드 추출이라 가장 저렴/빠른 모델로 충분하다.
const MODEL = 'claude-haiku-4-5';
import { logger } from './logger';

export interface ExtractedOrder {
  isOrderConfirmation: boolean;
  itemName: string | null;
  /** yyyy-MM-dd */
  orderDate: string | null;
  /** yyyy-MM-dd — 정기배송·구독이면 다음 배송일/결제일, 일반주문이면 예상 도착일 */
  expectedDeliveryDate: string | null;
  /** 구매 유형 추정 — GENERAL(일반 구매, 전자제품 포함)/RECURRING_DELIVERY(정기배송)/SUBSCRIPTION(정기구독). */
  estimatedType: 'GENERAL' | 'RECURRING_DELIVERY' | 'SUBSCRIPTION' | null;
  /**
   * 결제/주문 금액(원). 통화 기호·콤마 없는 정수. 원본이 원화면 이 필드를 채운다.
   * 원본이 외화(달러 등)면 이 필드는 null로 두고 대신 originalAmount/currency를 채운다 —
   * 서버가 결제일 기준 환율로 직접 환산하므로 여기서 잘못 변환하려 하지 마라.
   */
  amount: number | null;
  /** 원본에 명시된 통화 코드(ISO 4217, 예: "USD", "EUR", "JPY"). 원화(원/₩/KRW)면 null. */
  currency: string | null;
  /** currency가 non-null일 때만 채운다: 원본 외화 결제 금액(소수점 유지, 예: 7.99). currency가 null이면 반드시 null. */
  originalAmount: number | null;
  /** 지출 카테고리 추정 — 모든 구매 유형에 대해 채운다(판단 불가면 OTHER). */
  category: 'SOFTWARE' | 'AI' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'HAIR_BODY' | 'SKINCARE' | 'PET' | 'ELECTRONICS' | 'CREATOR_SUPPORT' | 'CLOUD' | 'OTHER' | null;
  /** All applicable categories for a mixed-product order. category is the primary one. */
  categoryTags: Array<'SOFTWARE' | 'AI' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'HAIR_BODY' | 'SKINCARE' | 'PET' | 'ELECTRONICS' | 'CREATOR_SUPPORT' | 'CLOUD' | 'OTHER'>;
  /**
   * estimatedType이 GENERAL일 때만 의미 있다: 냉장고/TV/세탁기/노트북/청소기 등 A/S 보증기간
   * 추적이 중요한 가전제품으로 보이면 true. RECURRING_DELIVERY/SUBSCRIPTION이면 항상 false.
   * true면 서버가 반품기한과 별개로 A/S 보증기간(기본 12개월)도 함께 등록 대기 목록에 프리필한다.
   */
  looksLikeElectronics: boolean;
  /** 반품/교환 기한이 원본에 구체적으로 명시되어 있었는지. */
  foundExplicitDeadline: boolean;
  /** 주문일 기준 반품/교환 가능 일수. foundExplicitDeadline=false면 null. */
  returnDeadlineDays: number | null;
  /** RECURRING_DELIVERY/SUBSCRIPTION일 때만 채운다: 배송·결제 주기(일수). null이면 명시 안 됨. */
  intervalDays: number | null;
  /** RECURRING_DELIVERY/SUBSCRIPTION일 때만 채운다: 스케줄 방식. "매월 N일" 고정이면 FIXED_DAY, 그 외 INTERVAL. */
  scheduleType: 'INTERVAL' | 'FIXED_DAY';
  /** scheduleType=FIXED_DAY일 때만 채운다: 매월 결제/배송되는 날짜(1~31). 그 외 null. */
  fixedDayOfMonth: number | null;
  /**
   * scheduleType=FIXED_DAY일 때만 의미 있다: 몇 달마다 반복되는지(1~6). "고정 15일"처럼 매월이면
   * 1. "2달마다 15일 고정"/"격월 15일 고정"처럼 개월 간격이 있으면 그 값(예: 2). 명시 안 됐거나
   * scheduleType=INTERVAL이면 1(기존과 동일한 매월 동작).
   */
  fixedDayIntervalMonths: number | null;
  /**
   * RECURRING_DELIVERY/SUBSCRIPTION이고 주기·고정일이 모호하게만 언급됐을 때(예: "매월
   * 자동결제"라고만 쓰여있고 정확한 날짜/주기 표기가 없음) true. 이때 intervalDays=30(기본
   * 추정치)으로 채워지므로, 화면에서 "추정치 — 정확한 주기를 확인해주세요" 경고를 보여줘야 한다.
   */
  scheduleEstimated: boolean;
  /** 판매처/브랜드명(예: "쿠팡", "네이버", "Netflix"). 감지 불가하면 null. */
  brand: string | null;
  /** brand의 공식 도메인(예: "coupang.com", "netflix.com"). 로고 표시용 — 확신 없으면 null. */
  brandDomain: string | null;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    isOrderConfirmation: {
      type: 'boolean',
      description:
        '이 메일이 온라인 쇼핑몰/구독 서비스의 "주문 완료", "결제 완료", "정기배송 신청/변경 완료", "구독 시작" 확인 메일이면 true. 광고, 뉴스레터, 배송 상태 업데이트(이미 지난 주문의 배송 출발·도착 알림), 설문·리뷰 요청, 다른 서비스(택배, OTP, 뉴스 등) 메일은 false.',
    },
    itemName: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: '주문한 상품명 또는 구독 서비스명(대표 1개, 여러 개면 첫 번째 + 외 n건)',
    },
    orderDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'yyyy-MM-dd 형식의 주문일/구독 신청일/결제일. 원본에 없으면 null.',
    },
    expectedDeliveryDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'yyyy-MM-dd 형식.\n' +
        'RECURRING_DELIVERY(실물 정기배송)면: 메일 본문에 사용자가 직접 적어 넣은 도착일 표기 ' +
        '("도착 4월 2일", "4월 2일 도착", "첫 배송 예정일: ...", "예상 도착일 ..." 등 — "도착"이라는 ' +
        '단어와 날짜만 붙어 있으면 순서·형식 무관하게 인정)가 있으면 그 값을 무조건 최우선으로 쓴다' +
        '(스토어 확인 메일에는 배송 주기가 거의 안 적혀 있어서, 사용자가 전달 시 직접 남긴 값이 ' +
        '유일한 근거인 경우가 많다) — 이 값은 배송 사이클이 반복되는 위상 기준점("최초 도착일")이라 ' +
        '"다음 배송일"과 의미가 다르다. 사용자가 적어 넣지 않았다면 스토어 본문의 "다음 배송일"/' +
        '"예상 도착일"로 대체.\n' +
        'SUBSCRIPTION(디지털 정기구독)이면: "다음 결제일", "갱신일", "만료일", "다음 청구일" 중 ' +
        '가장 명확한 날짜.\n' +
        'GENERAL(일반 구매)이면: 메일 본문에 사용자가 직접 적어 넣은 도착일 표기("도착 4월 2일", ' +
        '"4월 2일 도착" 등, 순서·형식 무관)가 있으면 그 값을 무조건 최우선으로 쓴다(1회성 구매도 ' +
        '스토어 확인 메일에 정확한 도착 예정일이 없는 경우가 많다) — 이 날짜가 반품기한(7일)·A/S ' +
        '보증(1년)의 기산일이 된다. 사용자가 적어 넣지 않았다면 스토어 본문의 예상 도착일로 대체.\n' +
        '명시되지 않으면 null.',
    },
    estimatedType: {
      anyOf: [{ type: 'string', enum: ['GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION'] }, { type: 'null' }],
      description:
        '구매 유형 추정. 아래 우선순위대로 판단해라.\n' +
        '1순위 RECURRING_DELIVERY(실물이 정기적으로 배송됨): "정기배송", "배송주기", "다음 배송일", "정기 할인" 등 ' +
        '실물 배송을 가리키는 표현이 있으면 이 값. 생수, 밀키트, 사료, 신선식품, 화장품 정기배송처럼 매번 물건이 집으로 오는 서비스.\n' +
        '2순위 SUBSCRIPTION(실물 배송 없는 디지털/멤버십 정기결제): 아래 키워드/패턴 중 하나라도 있고 실물 배송 언급이 없으면 이 값:\n' +
        '  - "구독", "구독 시작", "구독 변경", "구독 갱신", "구독 만료", "멤버십", "월 구독", "연 구독"\n' +
        '  - "정기결제", "자동결제", "자동 갱신", "갱신일", "만료일", "다음 결제일", "다음 청구일", "갱신 예정"\n' +
        '  - "도메인 갱신", "호스팅 갱신", "라이선스 갱신", "클라우드 저장공간"\n' +
        '  - 넷플릭스, 유튜브 프리미엄, 스포티파이, 디즈니플러스, 왓챠, Claude, ChatGPT, Gemini, Anthropic, ' +
        'OpenAI, Perplexity, Midjourney 등 스트리밍/OTT/AI 챗봇 서비스명(서비스명 자체가 정기결제형 ' +
        '서비스로 잘 알려져 있으면, "구독"/"결제" 같은 다른 키워드가 전혀 없어도 이것만으로 충분하다)\n' +
        '  - subscription, renewal, billing cycle, next billing date, auto-renew (영문)\n' +
        '  - **청구 기간(billing period)이 명시되어 있으면 그 자체가 강한 SUBSCRIPTION 신호다** ' +
        '(예: "Jun 18 – Jul 18, 2026", "이용기간: 2026.07.10~2026.08.09") — "구독"이라는 단어가 ' +
        '전혀 없어도, 영수증(Receipt)/인보이스(Invoice) 형태의 결제 확인 메일에 이런 기간 표기가 ' +
        '있으면 정기 결제 서비스라는 뜻이다. 일회성 구매에는 "이용 기간"이라는 개념 자체가 없다.\n' +
        '3순위 GENERAL: 위 두 조건에 해당하지 않는 일반 구매 — 냉장고/TV/노트북 등 보증기간이 중요한 가전제품도, ' +
        '일반 쇼핑몰 주문(의류/식품/도서 등 일회성 구매)도 전부 이 값.\n' +
        'isOrderConfirmation=false면 null.',
    },
    amount: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        '원본이 원화(원, ₩, KRW)로 명시된 경우에만 채운다: 결제/주문 금액을 원 단위 정수로 추출. ' +
        '"12,900원"→12900. 여러 상품/금액이 섞여 있으면 실제 결제된 총액(최종 결제금액)을 우선. ' +
        '원본이 외화(달러 등)로 명시됐거나 금액이 전혀 없으면 반드시 null(외화면 originalAmount/currency로).',
    },
    currency: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        '결제 금액의 통화가 원화가 아니라 외화($, €, ¥, £ 등)로 명시된 경우에만 그 ISO 4217 코드' +
        '(예: "USD", "EUR", "JPY"). 원화(원/₩/KRW) 표기면 반드시 null — 해외 서비스(넷플릭스 등)라도 ' +
        '한국 카드로 원화 청구된 것으로 보이면(원/₩ 표기) null. isOrderConfirmation=false면 null.',
    },
    originalAmount: {
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description:
        'currency가 non-null일 때만 채운다: 원본에 명시된 외화 결제 금액, 통화 기호·콤마 없이 ' +
        '소수점은 그대로 유지(예: "$7.99"→7.99, "€12"→12). currency가 null이면 반드시 null.',
    },
    category: {
      anyOf: [
        { type: 'string', enum: ['SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY', 'SKINCARE', 'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER'] },
        { type: 'null' },
      ],
      description:
        '지출 카테고리 추정 — estimatedType과 무관하게 모든 구매에 대해 채운다.\n' +
        'SOFTWARE: 도메인/호스팅, 소프트웨어·앱 라이선스 등 개발/생산성 도구 정기결제.\n' +
        'AI: Claude, ChatGPT, Gemini 등 AI 챗봇/생성형 AI 서비스 구독.\n' +
        'ENTERTAINMENT: 넷플릭스, 유튜브 프리미엄, 스포티파이, 디즈니플러스, 왓챠 등 영상·음악 스트리밍/OTT.\n' +
        'SHOPPING: 쿠팡 와우, 네이버플러스 멤버십 등 쇼핑 멤버십/정기할인 구독, 일반 쇼핑몰 주문(의류/잡화·건강보조식품·운동용품·헬스장/운동 서비스 등). 건강·운동 관련 결제는 OTHER가 아니라 반드시 SHOPPING.\n' +
        'FOOD: 생수, 밀키트, 신선식품, 커피, 반찬 등 실물 식품·음료(정기배송이든 일반 주문이든).\n' +
        'HAIR_BODY: 샴푸, 린스, 바디워시, 바디로션, 데오드란트, 두피 케어 등 헤어·바디 케어 제품.\n' +
        'SKINCARE: 스킨, 토너, 세럼, 크림, 선크림, 클렌저, 마스크팩 등 얼굴 피부 관리 화장품.\n' +
        'PET: 반려동물 사료, 간식, 모래, 용품, 정기배송 및 반려동물 서비스.\n' +
        'ELECTRONICS: 휴대폰, 노트북, TV, 냉장고, 청소기, 주변기기 등 전자제품·가전제품.\n' +
        'CREATOR_SUPPORT: 유튜브 멤버십, 트위치 구독, 패트리온 등 특정 크리에이터/채널 후원성 결제.\n' +
        'CLOUD: 클라우드 저장공간(구글원, iCloud+, 드롭박스 등) 정기결제.\n' +
        '위에 뚜렷이 해당하지 않으면 OTHER(사료 등). ' +
        'isOrderConfirmation=false면 반드시 null.',
    },
    categoryTags: {
      type: 'array',
      items: { type: 'string', enum: ['SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY', 'SKINCARE', 'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER'] },
      description:
        'One or more applicable spending categories, without duplicates. Use this only for the actual products in the order, not the marketplace. category must be the first/primary tag. Examples: body sunscreen lotion = HAIR_BODY and SKINCARE; shampoo brush = HAIR_BODY; deodorant and mask-pack bundle = HAIR_BODY and SKINCARE.',
    },
    looksLikeElectronics: {
      type: 'boolean',
      description:
        'estimatedType이 GENERAL일 때만 의미 있다: 냉장고/TV/세탁기/노트북/청소기 등 A/S 보증기간 추적이 ' +
        '중요한 가전제품으로 보이면 true. RECURRING_DELIVERY/SUBSCRIPTION이거나 가전제품이 아니거나 ' +
        'isOrderConfirmation=false면 false.',
    },
    foundExplicitDeadline: {
      type: 'boolean',
      description:
        '반품/교환 가능 기한이 구체적인 숫자(예: "7일 이내") 또는 날짜(예: "2026-07-25까지")로 명시되어 있으면 true. 없으면 false.',
    },
    returnDeadlineDays: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'foundExplicitDeadline=true일 때만 채운다: 주문일 기준 반품/교환 가능 일수. "7일 이내"→7, "2026-07-25까지"→주문일과의 차이(일수). foundExplicitDeadline=false면 반드시 null.',
    },
    intervalDays: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'estimatedType이 RECURRING_DELIVERY 또는 SUBSCRIPTION이고 scheduleType=INTERVAL일 때만 채운다: 배송·결제·갱신 주기를 일수(정수)로 변환.\n' +
        'RECURRING_DELIVERY면 스토어 본문보다 사용자가 직접 적어 넣은 "배송 주기: N주" 표기를 최우선으로 ' +
        '쓴다(예: "배송 주기: 4주"→28, "배송주기 2주"→14, "격주 배송"→14) — 실제 스토어 메일엔 주기가 ' +
        '거의 명시돼 있지 않다.\n' +
        '변환 기준: "매주"=7, "격주"=14, "N주"/"N주마다"=N*7(예: "3주"=21, "4주"=28), ' +
        '"매월"/"한달마다"/"30일마다"=30, "반년"/"반 년"=180, "N개월"/"N달"/"N개월마다"/"N달마다"=N*30' +
        '(예: "4개월마다"=120, "5달마다"=150), "6주마다"=42, "2달마다"/"격월"=60, "분기마다"/"3달마다"=90, ' +
        '"연간"/"매년"/"1년마다"/"격년"/"N년"/"N년마다"=N*365(예: "연간"/"매년"/"1년마다"=365, "격년"=730, ' +
        '"2년마다"=730, "3년마다"=1095). ' +
        '**주의**: "12개월"/"24개월"/"36개월"처럼 12의 배수인 개월 수는 "N개월"=N*30 공식을 쓰지 말고 ' +
        '반드시 년 단위로 환산해라 — "12개월"은 "1년"과 같은 뜻이라 365(360이 아님), "24개월"=730, ' +
        '"36개월"=1095.\n' +
        '주기가 "매월 자동결제됩니다"처럼 모호하게만 언급되고 정확한 날짜/주기 표기가 없으면 30(한 달 기본 추정치)을 넣고 scheduleEstimated=true로 표시해라.\n' +
        'scheduleType=FIXED_DAY이거나 주기가 전혀 언급되지 않았거나 RECURRING_DELIVERY/SUBSCRIPTION이 아니면 null.',
    },
    scheduleType: {
      type: 'string',
      enum: ['INTERVAL', 'FIXED_DAY'],
      description:
        'estimatedType이 RECURRING_DELIVERY 또는 SUBSCRIPTION일 때만 의미 있다. ' +
        '"매월 N일", "매월 N일에 자동결제", "every month on the Nth" 처럼 달력의 특정 날짜(1~31)가 고정된 방식이거나, ' +
        'RECURRING_DELIVERY에서 사용자가 직접 적은 "고정 N일"/"매월 N일 고정"(며칠마다가 아니라 매월 특정일에 고정으로 오는 정기배송) 표기가 있으면 FIXED_DAY. ' +
        '"매월 N일"이라고 명시하지 않아도, 결제 관련 날짜 2개(결제일-다음 결제 예정일, 또는 ' +
        '청구 기간의 시작-종료일)가 한 달 간격이고 같은 일(day)이면 FIXED_DAY다 — "이용기간"이 ' +
        '결제일 당일부터인지 다음 날부터인지는 서비스마다 달라 무시하고, 실제 결제 이벤트 날짜끼리만 ' +
        '비교해라(예: "결제일 2026.07.09" + "다음 결제 예정일 2026.08.09" → fixedDayOfMonth=9. ' +
        '"Paid June 18, 2026" + "Jun 18 – Jul 18, 2026" → fixedDayOfMonth=18). ' +
        '30일 근사치로 뭉개면 안 됨 — 달마다 일수가 달라 누적 오차가 생긴다. ' +
        '"매월"(일 미지정), "4주마다", "30일마다", "매주" 등 간격(일수) 기반이면 INTERVAL. ' +
        'RECURRING_DELIVERY/SUBSCRIPTION이 아니거나 판단 불가능하면 INTERVAL(기본값).',
    },
    fixedDayOfMonth: {
      // Anthropic 구조화 출력 스키마는 integer 타입에 minimum/maximum 제약을 지원하지 않는다
      // (지정 시 output_config.format.schema 검증에서 400) — 범위 검증은 서버 쪽 sanitize 함수로 옮겼다.
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'scheduleType=FIXED_DAY일 때만 채운다: "매월 N일" 또는 사용자가 직접 적은 "고정 N일"에서 N(1~31 사이의 정수). ' +
        '"매월 1일 자동결제"→1, "15일에 청구"→15, "고정 20일"→20. scheduleType=INTERVAL이면 반드시 null.',
    },
    fixedDayIntervalMonths: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'scheduleType=FIXED_DAY일 때만 채운다: 몇 달마다 반복되는지(1~6). "고정 15일"처럼 개월 ' +
        '간격 언급이 없으면 1. "2달마다 15일 고정"/"격월 15일 고정"/"분기마다 1일 고정"처럼 개월 ' +
        '간격이 함께 있으면 그 값(격월=2, 분기=3, 반년마다=6). scheduleType=INTERVAL이면 반드시 null.',
    },
    scheduleEstimated: {
      type: 'boolean',
      description:
        'estimatedType이 RECURRING_DELIVERY 또는 SUBSCRIPTION이고, 주기/고정일이 원본에 정확히 명시되지 않아 ' +
        'intervalDays를 30일 기본값으로 추정해 채웠을 때만 true. 정확한 주기·고정일이 명시되어 있었다면 false.',
    },
    brand: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        '판매처 또는 브랜드명. 아래 우선순위로 판단한다.\n' +
        '1) 발신 도메인/발신자명이 마켓플레이스·서비스 자체(쿠팡, 네이버, 넷플릭스, 카카오 등)면 그 이름.\n' +
        '2) 발신 도메인이 브랜드 자사 도메인이거나, 마켓플레이스 안에서도 "공식스토어"/"공식판매처"/' +
        '"공식몰"/"official store" 등으로 명시된 셀러라면 그 원 브랜드명(예: "Nike", "삼성").\n' +
        '3) "병행수입", "해외구매대행", "정품수입", "총판", "리셀러" 등 공식 여부가 불명확하거나 ' +
        '제3자 판매·수입임이 드러나면, 원 브랜드명을 추측하지 말고 1)의 마켓플레이스명으로 채우거나' +
        '(마켓플레이스 주문이면) 그마저 불명확하면 null. 상품명에 브랜드명이 보인다는 이유만으로 ' +
        '2)를 적용하지 마라 — 반드시 "공식" 근거(자사 도메인 또는 명시적 공식스토어 표기)가 있어야 한다.\n' +
        '확신하기 어려우면 null. isOrderConfirmation=false이면 반드시 null.',
    },
    brandDomain: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        '위 brand의 공식 도메인(로고 표시용, 예: "coupang.com", "netflix.com", "nike.com"). ' +
        'brand가 null이면 반드시 null. brand가 있어도 그 회사의 정확한 공식 도메인을 확신할 수 없으면 ' +
        '반드시 null(틀린 도메인을 추측해서 채우지 마라). "www." 접두사·경로 없이 순수 도메인만.',
    },
  },
  required: [
    'isOrderConfirmation',
    'itemName',
    'orderDate',
    'expectedDeliveryDate',
    'estimatedType',
    'amount',
    'currency',
    'originalAmount',
    'category',
    'categoryTags',
    'looksLikeElectronics',
    'foundExplicitDeadline',
    'returnDeadlineDays',
    'intervalDays',
    'scheduleType',
    'fixedDayOfMonth',
    'fixedDayIntervalMonths',
    'scheduleEstimated',
    'brand',
    'brandDomain',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `너는 이메일 포워딩으로 전달된 메일을 분류하고 핵심 정보를 추출하는 전문 파서다.

## 1단계: 메일 종류 판단 (isOrderConfirmation)
아래 중 하나면 true:
- 온라인 쇼핑몰 주문/결제 완료 확인 메일 (쿠팡, 네이버쇼핑, 무신사, 올리브영, 아마존 등)
- 정기배송 신청/구독 시작/구독 변경/구독 갱신 확인 메일
- 넷플릭스·유튜브 프리미엄·스포티파이 등 디지털 구독 서비스의 결제 완료/갱신 알림
- 도메인·호스팅·소프트웨어 라이선스 갱신 완료 또는 갱신 예정 안내

아래는 전부 false:
- 광고, 프로모션, 뉴스레터
- 배송 상태 업데이트 (배송 출발·도착 알림)
- "구매 확정해주세요" / "구매확정 요청" 메일 (배송 완료 후 확정 유도 메일)
- 설문·리뷰 요청
- OTP, 비밀번호 재설정, 기타 인증 메일

확신이 서지 않으면 false를 선택해라 — 애매하면 등록 대기 목록에 올리지 않는 쪽이 안전하다.

## 2단계: 종류 추정 (estimatedType) — 정기배송·구독을 최우선으로 인식
isOrderConfirmation=true일 때, 아래 순서대로 판단한다. 핵심 기준은 "실물이 집으로 배송되는가":

**RECURRING_DELIVERY (실물 정기배송, 1순위)**: 아래 표현이 있고 실제로 물건이 배송되는 서비스면 이 값:
- "정기배송", "배송 주기", "다음 배송일", "정기 할인"
- 생수, 밀키트, 사료, 신선식품, 화장품, 반찬 등 실물 상품의 정기배송/구독

**SUBSCRIPTION (실물 배송 없는 디지털/멤버십 정기결제, 2순위)**: 실물 배송 언급 없이 아래
키워드/패턴 중 하나라도 있으면 이 값:
- "구독", "구독 시작", "구독 변경", "구독 갱신", "구독 만료", "멤버십", "월 구독", "연 구독"
- "정기결제", "자동결제", "자동 갱신", "갱신일", "만료일", "다음 결제일", "다음 청구일", "갱신 예정"
- "도메인 갱신", "호스팅 갱신", "라이선스 갱신", "클라우드 저장공간"
- 넷플릭스, 유튜브 프리미엄, 스포티파이, 디즈니플러스, 왓챠, Claude, ChatGPT, Gemini, Anthropic,
  OpenAI, Perplexity, Midjourney 등 스트리밍/OTT/AI 챗봇 서비스 — 서비스명 자체가 정기결제형으로
  잘 알려져 있으면, "구독"/"자동결제" 같은 다른 키워드가 전혀 없어도 이것만으로 충분하다. 예:
  "Receipt from Anthropic, PBC" + "Claude Pro" + "$22.00" + "Paid June 18, 2026"처럼 "구독"이란
  단어가 한 번도 안 나와도 SUBSCRIPTION이다.
- subscription, renewal, billing cycle, next billing date, auto-renew (영문)
- **청구 기간(billing period)이 명시되어 있으면 그 자체가 강한 신호다**: "Jun 18 – Jul 18, 2026",
  "이용기간: 2026.07.10~2026.08.09"처럼 결제 확인/영수증(Receipt)/인보이스(Invoice) 메일에 기간
  표기가 있으면, 다른 구독 키워드가 없어도 정기 결제 서비스로 판단해라 — 일회성 구매엔 "이용
  기간"이라는 개념 자체가 없다.

**GENERAL**: 위 두 가지에 해당하지 않는 일반 구매 — 냉장고/TV/세탁기/노트북/청소기 등 보증기간이
중요한 가전제품도, 의류·식품·도서·화장품 등 일회성 주문도 전부 이 값.

## 3단계: 지출 카테고리 추정 (category) — 모든 구매에 대해 채운다
- SOFTWARE: 도메인/호스팅, 소프트웨어·앱 라이선스 등 개발/생산성 도구 정기결제
- AI: Claude, ChatGPT, Gemini 등 AI 챗봇/생성형 AI 서비스 구독
- ENTERTAINMENT: 넷플릭스, 유튜브 프리미엄, 스포티파이, 디즈니플러스, 왓챠 등 영상·음악 스트리밍/OTT
- SHOPPING: 쿠팡 와우, 네이버플러스 멤버십 등 쇼핑 멤버십/정기할인 구독, 일반 쇼핑몰 주문(의류/잡화·건강보조식품·운동용품·헬스장/운동 서비스 등). 건강·운동 관련 결제는 OTHER가 아니라 반드시 SHOPPING
- FOOD: 생수, 밀키트, 신선식품, 커피, 반찬 등 실물 식품·음료(정기배송이든 일반 주문이든)
- HAIR_BODY: 샴푸, 린스, 바디워시, 바디로션, 데오드란트, 두피 케어 등 헤어·바디 케어 제품
- SKINCARE: 스킨, 토너, 세럼, 크림, 선크림, 클렌저, 마스크팩 등 얼굴 피부 관리 화장품
- PET: 반려동물 사료, 간식, 모래, 용품, 정기배송 및 반려동물 서비스
- ELECTRONICS: 휴대폰, 노트북, TV, 냉장고, 청소기, 주변기기 등 전자제품·가전제품
- CREATOR_SUPPORT: 유튜브 멤버십, 트위치 구독, 패트리온 등 크리에이터/채널 후원성 결제
- CLOUD: 클라우드 저장공간(구글원, iCloud+, 드롭박스 등) 정기결제
- 위에 뚜렷이 해당하지 않으면 OTHER (사료 등)
isOrderConfirmation=false면 반드시 null.

## 3-1단계: 전자제품 판단 (looksLikeElectronics) — estimatedType이 GENERAL일 때만
냉장고, TV, 세탁기, 노트북, 청소기 등 A/S 보증기간 추적이 중요한 가전제품으로 보이면 true —
서버가 반품기한과 별개로 A/S 보증기간(기본 12개월)도 함께 등록 대기 목록에 프리필한다.
RECURRING_DELIVERY/SUBSCRIPTION이거나 가전제품이 아니면 false.

## 4단계: 스케줄 방식 판단 (scheduleType) + 주기 추출 (intervalDays / fixedDayOfMonth / fixedDayIntervalMonths / scheduleEstimated)
RECURRING_DELIVERY 또는 SUBSCRIPTION으로 판단했을 때:

**RECURRING_DELIVERY 전용 — 사용자가 직접 적어 넣은 값이 최우선**: 실제 스토어 주문확인 메일에는
배송 주기가 거의 명시되어 있지 않다. 그래서 이 서비스는 사용자에게 전달(포워딩) 시 메일 본문에
주기와 도착일을 직접 적어 넣도록 안내한다. 이렇게 사용자가 직접 남긴 표기가 있으면, 스토어
원문의 다른 어떤 표현보다도 최우선으로 그 값을 쓴다.

표기 형식은 자유롭다 — "배송 주기"/"주기"라는 단어가 꼭 붙지 않아도 되고, 콜론(:)도 필수가
아니며, 숫자+기간 단위만 단독으로 적혀 있어도(다른 주기 정보가 없다면) 그게 주기다. "도착"도
날짜 앞이든 뒤든 상관없다. 아래 예시는 전부 같은 방식으로 해석해야 한다:
- "배송 주기: 4주" / "주기 4주" / "배송주기 2주" / "격주 배송" → intervalDays(4주=28, 2주=14, 격주=14)
- "1개월" / "2개월 주기" / "6개월 주기"(단독으로 적혀 있어도 주기 표기로 인정) → intervalDays(30, 60, 180)
- "고정 15일" / "매월 15일 고정" / "고정 N일"(N=1~31, 순서·형식 무관) → scheduleType=FIXED_DAY,
  fixedDayOfMonth=N, intervalDays=null, fixedDayIntervalMonths=1(개월 간격 언급 없으면 매월) —
  정기배송이 며칠마다 오는 게 아니라 매월(또는 몇 달마다) 특정일에 고정으로 오는 경우다. "고정"
  이라는 단어와 1~31 사이 날짜가 함께 있으면 위 주기(intervalDays) 표기보다 이걸 우선한다.
- "2달마다 고정 15일" / "격월 고정 15일" / "분기마다 고정 1일" / "반년마다 고정 10일"처럼 "고정
  N일" 앞뒤에 개월 간격이 함께 있으면 → scheduleType=FIXED_DAY, fixedDayOfMonth=N, intervalDays=null,
  fixedDayIntervalMonths=그 개월 수(격월=2, 분기=3, 반년마다=6, "3달마다"=3 등 — 1~6 범위).
- "첫 배송 예정일: 2026-07-28" / "예상 도착일 826" / "도착 4월 2일" / "4월 2일 도착" → expectedDeliveryDate
  (구체적인 변환은 5단계 날짜 표기 규칙대로).
예시: "배송 주기: 4주\n첫 배송 예정일: 2026-07-28" → intervalDays=28, scheduleType=INTERVAL,
scheduleEstimated=false, expectedDeliveryDate="2026-07-28".
예시: "주기 2개월 / 도착 4월 2일" → intervalDays=60, expectedDeliveryDate는 올해 4월 2일로 해석.
예시: "고정 15일 / 도착 4월 2일" → scheduleType=FIXED_DAY, fixedDayOfMonth=15, intervalDays=null,
fixedDayIntervalMonths=1, expectedDeliveryDate는 올해 4월 2일로 해석(그달의 15일이 아니라 사용자가
적은 도착일 그대로).
예시: "2달마다 고정 1일 / 도착 10월 6일" → scheduleType=FIXED_DAY, fixedDayOfMonth=1, intervalDays=null,
fixedDayIntervalMonths=2, expectedDeliveryDate는 올해 10월 6일로 해석.

**FIXED_DAY 판단**: "매월 N일", "매월 N일에 자동결제", "every month on the Nth", 사용자가 직접
적은 "고정 N일"/"매월 N일 고정" 등 달력의 특정 날짜가 고정된 경우 → scheduleType=FIXED_DAY,
fixedDayOfMonth=N, intervalDays=null, fixedDayIntervalMonths=1(개월 간격 언급 없으면 매월),
scheduleEstimated=false. "격월 N일 결제"/"분기별 N일 청구"처럼 개월 간격이 명시되면
fixedDayIntervalMonths을 그 값으로(격월=2, 분기=3, 반기=6).
예시: "매월 1일 자동결제됩니다" → FIXED_DAY, fixedDayOfMonth=1, fixedDayIntervalMonths=1
예시: "15일에 청구됩니다" + 월 단위 구독 → FIXED_DAY, fixedDayOfMonth=15, fixedDayIntervalMonths=1
예시: "고정 20일" → FIXED_DAY, fixedDayOfMonth=20, fixedDayIntervalMonths=1
예시: "매 분기 1일 청구" → FIXED_DAY, fixedDayOfMonth=1, fixedDayIntervalMonths=3

**"결제일"이라고 명시적으로 안 써 있어도, 결제(예정) 관련 날짜 2개가 한 달 간격 + 같은 일(day)이면
FIXED_DAY다 — 이게 가장 신뢰할 수 있는 신호다.** 구독 영수증은 "매월 N일"이라고 대놓고 말하는
대신 결제일/다음 결제일, 또는 "이용기간"(서비스 사용 구간) 같은 표현으로 대신하는 경우가 많고,
이 "이용기간"이 결제일과 같은 날 시작하는지 다음 날부터 시작하는지는 서비스마다 다르고, 언어와도
무관하다 — 한국어 이메일이 영어식(기간 시작=결제일)을 따를 수도, 영어 이메일이 한국식(기간
시작=결제일 다음날)을 따를 수도 있다. 이메일이 한국어냐 영어냐로 관례를 추측하지 말고, 그 차이는
무시한 채 아래처럼 실제 "결제" 이벤트에 해당하는 날짜들만 비교해라:
- **결제일 vs 다음 결제 예정일**을 직접 준 경우 → 그 둘을 비교. 한 달 간격 + 같은 일이면 FIXED_DAY.
  예시(한국어 정기결제 영수증): "결제일 2026.07.09" + "다음 결제 예정일 2026.08.09" → FIXED_DAY,
  fixedDayOfMonth=9. ("이용기간 2026.07.10~2026.08.09"처럼 이용기간이 결제일 다음 날부터
  시작해도 상관없다 — 결제일 자체끼리 비교했으므로 무관하다.)
- **"Paid <Date>" + 청구 기간(period) "<시작> – <종료>"**만 주어진 경우(다음 결제일이 따로 없음)
  → 청구 기간의 시작일과 종료일을 비교(둘 다 결제 이벤트를 감싸는 날짜라 한 달 간격이면 그대로
  고정 주기 신호). 이때 결제일(Paid 날짜)은 보통 기간 시작일과 같지만, 그것도 서비스마다 다를 수
  있으니 몇 일에 결제했는지보다 기간의 시작–종료 날짜 자체(같은 일, 한 달 간격)를 근거로 삼아라.
  예시(Stripe식 해외 SaaS): "Paid June 18, 2026" + "Jun 18 – Jul 18, 2026" → FIXED_DAY,
  fixedDayOfMonth=18.
판단되면 scheduleType=FIXED_DAY, fixedDayOfMonth=그 날짜, intervalDays=null.
INTERVAL(30일 근사치)로 뭉개지 마라 — 30일은 실제 매월 날짜와 조금씩 어긋나서(2월은 28일, 31일
까지 있는 달도 있음) 여러 달 누적되면 실제 결제일과 계산값이 벌어진다.

**INTERVAL 판단**: 간격 기반 (일/주/월/년 단위 간격) → scheduleType=INTERVAL, fixedDayOfMonth=null
intervalDays 변환 기준:
- "매주" → 7
- "격주" → 14
- "N주" / "N주마다" → N*7 (예: "3주마다" → 21, "4주마다" → 28)
- "28일마다" → 28
- "매월"(일 미지정) / "한달마다" / "30일마다" / monthly → 30
- "반년" / "반 년" → 180
- "N개월" / "N달" / "N개월마다" / "N달마다" → N*30 (예: "4개월마다" → 120, "5달마다" → 150) —
  "2달마다"/"분기마다"/"3달마다"도 이 규칙에 포함되므로 별도 암기할 필요 없음
- "6주마다" → 42
- "N년" / "N년마다" / "연간" / "매년" / "1년마다" / "격년" / annually / yearly → N*365 (예: "연간"/
  "매년"/"1년마다" → 365, "격년" → 730, "2년마다" → 730, "3년마다" → 1095) — 자동차 정기점검,
  보험 갱신처럼 1년을 넘어가는 주기도 이 규칙으로 처리한다.
- **"12개월"/"24개월"/"36개월"처럼 12의 배수인 개월 수는 위 "N개월=N*30" 공식을 쓰지 말고 년
  단위로 환산해라**: "12개월"은 일상적으로 "1년"과 같은 뜻이므로 365(12*30=360이 아님), "24개월"
  =730, "36개월"=1095.
이 경우 scheduleEstimated=false(주기가 명시적으로 표현됨).

**추정치 판단**: "매월 자동결제됩니다"처럼 정기 결제/배송이라는 사실만 있고 정확한 날짜·주기
표기가 전혀 없으면 → scheduleType=INTERVAL, intervalDays=30, scheduleEstimated=true.

**SUBSCRIPTION은 애매하면 FIXED_DAY를 우선 시도해라**: 위 추정치 판단에 해당하는 애매한
SUBSCRIPTION이라도, orderDate(주문일/결제일)를 뽑아낼 수 있었다면 그냥 INTERVAL=30으로 두지
말고 그 날짜의 "일"을 fixedDayOfMonth로 써서 scheduleType=FIXED_DAY로 판단해라(scheduleEstimated=
true는 유지) — 대부분의 정기구독은 매월 특정일 고정 결제 방식을 쓴다(사용자 입장에서 가장
직관적이라 실제로 압도적 다수가 이 패턴). orderDate조차 없어 근거로 삼을 날짜가 전혀 없을 때만
기존대로 INTERVAL=30으로 남겨라. (이 기본값은 서버에서도 한 번 더 강제 적용되니, 애매하면 이
쪽으로 판단하는 게 안전하다.)

판단 불가능하면 scheduleType=INTERVAL(기본값), fixedDayOfMonth=null, fixedDayIntervalMonths=null,
scheduleEstimated=false.

## 5단계: 날짜 추출
- orderDate: 주문일/구독 신청일/결제일 (yyyy-MM-dd)
- expectedDeliveryDate: RECURRING_DELIVERY면 사용자가 직접 적은 도착일 표기("도착 4월 2일",
  "4월 2일 도착", "첫 배송 예정일: ...", "예상 도착일 ..." 등 순서·형식 무관)를 최우선(4단계 참고),
  없으면 스토어 본문의 "다음 배송일"/"예상 도착일". SUBSCRIPTION이면 "다음 결제일", "갱신일",
  "만료일", "다음 청구일" 중 가장 명확한 날짜.
  **GENERAL이면** 마찬가지로 사용자가 메일 본문에 직접 적어 넣은 도착일 표기가 있으면(주기 표기는
  필요 없다 — GENERAL은 1회성 구매라 "배송 주기" 자체가 의미 없다) 그 값을 스토어 본문의 도착
  예정일 표현보다 최우선으로 쓴다 — 이 날짜가 반품기한(7일)·A/S 보증(1년) 기산일이 되기 때문에
  중요하다. 예시: "도착 4월 2일" / "4월 2일 도착" → expectedDeliveryDate는 아래 날짜 표기 규칙대로
  해석. 없으면 스토어 본문의 예상 도착일로 대체.
  next billing date, renewal date, expiry date 같은 영문 표현도 해당.
- 명시되지 않은 날짜는 추측하지 말고 null로 남겨라. 날짜는 반드시 yyyy-MM-dd로 변환.
- **날짜 표기 형식이 다양할 수 있다(특히 사용자가 직접 적어 넣는 예상 도착일)**: "8월 26일",
  "8/26", "08-26", "0826", "826"(월일 붙여 쓴 표기, 826→8월26일) 등 연도 없이 월일만 적힌 경우,
  기본적으로 오늘 날짜와 같은 연도로 간주해서 yyyy-MM-dd로 변환해라(예: 오늘이 2026-08-01이면
  "826"→"2026-08-26"). "2026-08-26"처럼 연도가 이미 명시돼 있으면 그 값을 그대로 쓴다.
  **연말·연초 경계 예외**: 그렇게 "오늘과 같은 연도"로 해석했을 때 그 날짜가 오늘보다 한 달 넘게
  과거가 되어버리면, 그건 이미 지난 날짜가 아니라 내년을 가리키는 것으로 보고 연도를 하나
  올려라 — 이 필드들은 전부 가까운 미래(다음 주문/배송/결제)를 뜻하는 값이라 한 달 넘게 지난
  과거일 리가 없다. 예: 오늘이 2026-12-31인데 메일에 "1월 3일"이라고만 적혀 있으면 "2026-01-03"
  (이미 1년 가까이 지난 과거)이 아니라 "2027-01-03"으로 변환해라.
  3~4자리 숫자만 있고 월일로 해석이 애매하면(예: 13개월 같은 불가능한 값) null로 남겨라.

## 6단계: 반품기한 추출 (GENERAL만 실질적으로 의미 있음)
반품/교환 가능 기한이 구체적인 숫자 또는 날짜로 명시된 경우에만 foundExplicitDeadline=true.
없으면 false, returnDeadlineDays=null (서버가 법정 최소 기준으로 대체).

## 7단계: 금액·통화 추출 (amount / currency / originalAmount)
실제 결제/청구된 총액을 추출한다. 여러 금액이 나오면 할인 전 정가가 아니라 최종 결제금액을 우선.

**원화(원, ₩, KRW) 표기면**: amount=그 금액(정수), currency=null, originalAmount=null.
넷플릭스·GitHub처럼 해외 서비스라도 한국 카드로 원화 결제되어 "원"/"₩"으로 찍히면 이 경우다.

**외화($, €, ¥, £ 등) 표기면**: amount=null(서버가 결제일 기준 환율로 직접 환산하므로 여기서
임의로 원화 변환하지 마라 — "$7.99"를 "7"이나 "799"로 넣는 것도 금지), currency=ISO 4217 코드
(예: "USD"), originalAmount=원본 금액을 소수점까지 그대로(예: "$7.99"→7.99).

금액이 전혀 없으면 amount=null, currency=null, originalAmount=null.

## 8단계: 상품 브랜드 판단 (brand / brandDomain) — 결제수단·판매처와 구분
brand는 결제 서비스나 쇼핑몰 이름이 아니라 **구매한 상품 자체의 브랜드**를 나타낸다. 아래 우선순위를
순서대로 적용하고, 메일에 없는 이름을 상식만으로 추측하지 마라.

1. **상품명에 브랜드가 명시된 경우 최우선**: "[에스네이처] 수분크림", "에이킨 데일리 바디 선로션",
   "Nike Air Max"처럼 상품명 앞부분에 제조사·브랜드명이 직접 적혀 있으면 그 이름을 brand로 쓴다.
   대괄호가 없어도 상품명에서 브랜드와 제품명이 명확히 구분되면 명시된 정보로 인정한다.
2. **결제대행사·간편결제는 절대 brand로 쓰지 않는다**: 네이버페이/N pay, 카카오페이, 토스페이,
   PayPal, 카드사, PG사는 결제수단일 뿐이다. 이들이 보낸 결제 메일이어도 상품명에서 브랜드를 찾는다.
3. **멀티브랜드 쇼핑몰·마켓플레이스도 상품 브랜드가 아니다**: 비그룸, 올리브영, 쿠팡, 지마켓,
   무신사 같은 판매처명·"결제처"·"판매자"는 상품 브랜드가 명시되지 않았을 때만 최후의 폴백으로 brand에
   쓴다. 예: 네이버페이 메일에 "결제처: 비그룸", "상품정보: 에이킨 데일리 바디 선로션"이 있으면
   brand="에이킨"이며, "네이버페이"나 "비그룸"이 아니다.
4. **한 주문에 서로 다른 상품 브랜드가 2개 이상이면 판매처를 대표값으로 쓴다**: brand 필드는 하나만
   저장할 수 있으므로 어느 한 상품 브랜드를 임의로 고르지 마라. 판매처가 명확하면 brand=판매처명,
   brandDomain=판매처 공식 도메인으로 채운다.
   예: 올리브영 주문에 그레이즈포인트와 메디힐 상품이 함께 있으면 brand="올리브영",
   brandDomain="oliveyoung.co.kr". 단일 브랜드 상품이면 이 규칙을 적용하지 않고 1)의 상품 브랜드를 쓴다.
   **같은 브랜드의 제품을 2개 이상 산 경우는 복수 브랜드가 아니다.** 상품 개수와 무관하게 서로 다른
   브랜드명이 하나뿐이면 brand에는 그 브랜드 하나를 쓴다.
5. **상품 브랜드가 불명확할 때만 보수적으로 처리**: 상품명에 제조사·브랜드로 볼 명확한 고유명이 없거나
   "병행수입", "해외구매대행", "리셀러"처럼 진위를 확인할 수 없는 경우에는 판매처명을 폴백으로 쓰고,
   판매처도 특정할 수 없으면 brand=null로 둔다.
6. **brandDomain은 메일에서 공식성이 직접 확인될 때만 채운다**: 모델의 사전 지식이나 추측으로 도메인을
   만들어내지 마라. 발신 도메인 또는 본문의 공식 스토어 URL이 해당 brand와 명확히 일치할 때만 채우고,
   결제대행사·마켓플레이스 링크뿐이거나 조금이라도 불확실하면 반드시 brandDomain=null로 남겨라.
7. isOrderConfirmation=false면 brand=null, brandDomain=null.

## 개인정보 보호
상품명, 날짜, 주기, 종류, 카테고리, 금액만 추출. 수령인 이름, 전화번호, 배송지 주소, 카드번호·결제수단
(마스킹된 카드번호 포함)은 절대 어떤 필드에도 포함하지 마라.`;

type MessageContent =
  | { type: 'text'; text: string };

/** 로그에 어느 채널 호출인지 남기기 위한 접두사 — 호출부에서 넘긴다. */
export async function callExtractionApi(
  apiKey: string,
  content: MessageContent[],
  logPrefix: string
): Promise<ExtractedOrder | null> {
  if (!apiKey) {
    console.warn(`[${logPrefix}] ANTHROPIC_API_KEY가 없어 파싱을 건너뜁니다`);
    return null;
  }

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    await res.text().catch(() => '');
    logger.error('ai.order_extraction_failed', { logPrefix, statusCode: res.status });
    return null;
  }

  const data = await res.json<{ content: Array<{ type: string; text?: string }>; stop_reason: string }>();

  if (data.stop_reason === 'refusal') {
    console.warn(`[${logPrefix}] Claude가 이 요청 처리를 거부했습니다`);
    return null;
  }

  const textBlock = data.content.find((block) => block.type === 'text' && block.text);
  if (!textBlock?.text) {
    console.error(`[${logPrefix}] 응답에 text 블록이 없습니다 (stop_reason: ${data.stop_reason})`);
    return null;
  }

  try {
    return JSON.parse(textBlock.text) as ExtractedOrder;
  } catch (err) {
    logger.error('ai.order_extraction_invalid_json', { logPrefix, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// 이메일 포워딩(email-extract.ts)으로 들어온 메일의 주문확인 판별 + 핵심 필드 추출 로직.
// SDK 없이 fetch로 Claude Messages API를 직접 호출한다(email.ts의 Resend REST 호출과 같은 패턴).

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// 분류 + 짧은 필드 추출이라 가장 저렴/빠른 모델로 충분하다.
const MODEL = 'claude-haiku-4-5';

export interface ExtractedOrder {
  isOrderConfirmation: boolean;
  itemName: string | null;
  /** yyyy-MM-dd */
  orderDate: string | null;
  /** yyyy-MM-dd — 정기배송·구독이면 다음 배송일/결제일, 일반주문이면 예상 도착일 */
  expectedDeliveryDate: string | null;
  /** 상품 종류 추정 */
  estimatedType: 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY' | 'SUBSCRIPTION' | null;
  /** 결제/주문 금액(원). 통화 기호·콤마 없는 정수. 원본에 금액이 없으면 null. */
  amount: number | null;
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
   * RECURRING_DELIVERY/SUBSCRIPTION이고 주기·고정일이 모호하게만 언급됐을 때(예: "매월
   * 자동결제"라고만 쓰여있고 정확한 날짜/주기 표기가 없음) true. 이때 intervalDays=30(기본
   * 추정치)으로 채워지므로, 화면에서 "추정치 — 정확한 주기를 확인해주세요" 경고를 보여줘야 한다.
   */
  scheduleEstimated: boolean;
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
        'yyyy-MM-dd 형식. 정기배송·구독이면 "다음 배송일", "다음 결제일", "갱신일", "만료일", "다음 청구일" 중 가장 명확한 날짜를 최우선으로 추출. 일반 주문이면 예상 도착일. 명시되지 않으면 null.',
    },
    estimatedType: {
      anyOf: [{ type: 'string', enum: ['ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY', 'SUBSCRIPTION'] }, { type: 'null' }],
      description:
        '종류 추정. 아래 우선순위대로 판단해라.\n' +
        '1순위 RECURRING_DELIVERY(실물이 정기적으로 배송됨): "정기배송", "배송주기", "다음 배송일", "정기 할인" 등 ' +
        '실물 배송을 가리키는 표현이 있으면 이 값. 생수, 밀키트, 사료, 신선식품, 화장품 정기배송처럼 매번 물건이 집으로 오는 서비스.\n' +
        '2순위 SUBSCRIPTION(실물 배송 없는 디지털/멤버십 정기결제): 아래 키워드/패턴 중 하나라도 있고 실물 배송 언급이 없으면 이 값:\n' +
        '  - "구독", "구독 시작", "구독 변경", "구독 갱신", "구독 만료", "멤버십", "월 구독", "연 구독"\n' +
        '  - "정기결제", "자동결제", "자동 갱신", "갱신일", "만료일", "다음 결제일", "다음 청구일", "갱신 예정"\n' +
        '  - "도메인 갱신", "호스팅 갱신", "라이선스 갱신", "클라우드 저장공간"\n' +
        '  - 넷플릭스, 유튜브 프리미엄, 스포티파이, 디즈니플러스, 왓챠 등 스트리밍/OTT 서비스명\n' +
        '  - subscription, renewal, billing cycle, next billing date, auto-renew (영문)\n' +
        '3순위 ELECTRONICS: 냉장고/TV/노트북/청소기 등 보증기간이 중요한 가전·전자제품.\n' +
        '4순위 ONLINE_ORDER: 위 세 조건에 해당하지 않는 일반 쇼핑몰 주문.\n' +
        'isOrderConfirmation=false면 null.',
    },
    amount: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        '결제/주문 금액을 원(KRW) 단위 정수로 추출. "12,900원"→12900, "\\u20a91,900"→1900. ' +
        '여러 상품/금액이 섞여 있으면 실제 결제된 총액(최종 결제금액)을 우선. 원본에 금액이 전혀 없으면 null.',
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
        '변환 기준: "매주"=7, "격주"=14, "3주마다"=21, "4주마다"/"28일마다"=28, ' +
        '"매월"/"한달마다"/"30일마다"=30, "6주마다"=42, "2달마다"/"격월"=60, ' +
        '"분기마다"/"3달마다"=90, "연간"/"매년"/"1년마다"=365.\n' +
        '주기가 "매월 자동결제됩니다"처럼 모호하게만 언급되고 정확한 날짜/주기 표기가 없으면 30(한 달 기본 추정치)을 넣고 scheduleEstimated=true로 표시해라.\n' +
        'scheduleType=FIXED_DAY이거나 주기가 전혀 언급되지 않았거나 RECURRING_DELIVERY/SUBSCRIPTION이 아니면 null.',
    },
    scheduleType: {
      type: 'string',
      enum: ['INTERVAL', 'FIXED_DAY'],
      description:
        'estimatedType이 RECURRING_DELIVERY 또는 SUBSCRIPTION일 때만 의미 있다. ' +
        '"매월 N일", "매월 N일에 자동결제", "every month on the Nth" 처럼 달력의 특정 날짜(1~31)가 고정된 방식이면 FIXED_DAY. ' +
        '"매월"(일 미지정), "4주마다", "30일마다", "매주" 등 간격(일수) 기반이면 INTERVAL. ' +
        'RECURRING_DELIVERY/SUBSCRIPTION이 아니거나 판단 불가능하면 INTERVAL(기본값).',
    },
    fixedDayOfMonth: {
      // Anthropic 구조화 출력 스키마는 integer 타입에 minimum/maximum 제약을 지원하지 않는다
      // (지정 시 output_config.format.schema 검증에서 400) — 범위 검증은 서버 쪽 sanitize 함수로 옮겼다.
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'scheduleType=FIXED_DAY일 때만 채운다: "매월 N일"에서 N(1~31 사이의 정수). ' +
        '"매월 1일 자동결제"→1, "15일에 청구"→15. scheduleType=INTERVAL이면 반드시 null.',
    },
    scheduleEstimated: {
      type: 'boolean',
      description:
        'estimatedType이 RECURRING_DELIVERY 또는 SUBSCRIPTION이고, 주기/고정일이 원본에 정확히 명시되지 않아 ' +
        'intervalDays를 30일 기본값으로 추정해 채웠을 때만 true. 정확한 주기·고정일이 명시되어 있었다면 false.',
    },
  },
  required: [
    'isOrderConfirmation',
    'itemName',
    'orderDate',
    'expectedDeliveryDate',
    'estimatedType',
    'amount',
    'foundExplicitDeadline',
    'returnDeadlineDays',
    'intervalDays',
    'scheduleType',
    'fixedDayOfMonth',
    'scheduleEstimated',
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
- 넷플릭스, 유튜브 프리미엄, 스포티파이, 디즈니플러스, 왓챠 등 스트리밍/OTT 서비스
- subscription, renewal, billing cycle, next billing date, auto-renew (영문)

**ELECTRONICS**: 냉장고, TV, 세탁기, 노트북, 청소기 등 보증기간이 중요한 가전·전자제품

**ONLINE_ORDER**: 위 세 가지에 해당하지 않는 일반 주문 (의류, 식품, 도서, 화장품 등 일회성 구매)

## 3단계: 스케줄 방식 판단 (scheduleType) + 주기 추출 (intervalDays / fixedDayOfMonth / scheduleEstimated)
RECURRING_DELIVERY 또는 SUBSCRIPTION으로 판단했을 때:

**FIXED_DAY 판단**: "매월 N일", "매월 N일에 자동결제", "every month on the Nth" 등 달력의
특정 날짜가 고정된 경우 → scheduleType=FIXED_DAY, fixedDayOfMonth=N, intervalDays=null, scheduleEstimated=false
예시: "매월 1일 자동결제됩니다" → FIXED_DAY, fixedDayOfMonth=1
예시: "15일에 청구됩니다" + 월 단위 구독 → FIXED_DAY, fixedDayOfMonth=15

**INTERVAL 판단**: 간격 기반 (일/주/월 단위 간격) → scheduleType=INTERVAL, fixedDayOfMonth=null
intervalDays 변환 기준:
- "매주" → 7
- "격주" → 14
- "3주마다" → 21
- "4주마다" / "28일마다" → 28
- "매월"(일 미지정) / "한달마다" / "30일마다" / monthly → 30
- "6주마다" → 42
- "2달마다" / "격월" → 60
- "분기마다" / "3달마다" → 90
- "연간" / "매년" / "1년마다" / annually / yearly → 365
이 경우 scheduleEstimated=false(주기가 명시적으로 표현됨).

**추정치 판단**: "매월 자동결제됩니다"처럼 정기 결제/배송이라는 사실만 있고 정확한 날짜·주기
표기가 전혀 없으면 → scheduleType=INTERVAL, intervalDays=30, scheduleEstimated=true.

판단 불가능하면 scheduleType=INTERVAL(기본값), fixedDayOfMonth=null, scheduleEstimated=false.

## 4단계: 날짜 추출
- orderDate: 주문일/구독 신청일/결제일 (yyyy-MM-dd)
- expectedDeliveryDate: RECURRING_DELIVERY/SUBSCRIPTION이면 "다음 배송일", "다음 결제일", "갱신일", "만료일",
  "다음 청구일" 중 가장 명확한 날짜를 최우선으로 추출. 일반 주문이면 예상 도착일.
  next billing date, renewal date, expiry date 같은 영문 표현도 해당.
- 명시되지 않은 날짜는 추측하지 말고 null로 남겨라. 날짜는 반드시 yyyy-MM-dd로 변환.

## 5단계: 반품기한 추출 (ONLINE_ORDER/ELECTRONICS만 실질적으로 의미 있음)
반품/교환 가능 기한이 구체적인 숫자 또는 날짜로 명시된 경우에만 foundExplicitDeadline=true.
없으면 false, returnDeadlineDays=null (서버가 법정 최소 기준으로 대체).

## 6단계: 금액 추출 (amount)
실제 결제/청구된 총액을 원(KRW) 단위 정수로 추출("12,900원"→12900). 여러 금액이 나오면
할인 전 정가가 아니라 최종 결제금액을 우선. 통화 기호·콤마 없는 순수 정수만 담고, 원본에
금액이 전혀 없으면 null.

## 개인정보 보호
상품명, 날짜, 주기, 종류, 금액만 추출. 수령인 이름, 전화번호, 배송지 주소, 카드번호·결제수단
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
    const body = await res.text().catch(() => '');
    console.error(`[${logPrefix}] Claude API 호출 실패 (${res.status}): ${body}`);
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
    console.error(`[${logPrefix}] JSON 파싱 실패: ${err}`, textBlock.text);
    return null;
  }
}

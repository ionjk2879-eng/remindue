// 이메일 포워딩으로 들어온 메일이 온라인 쇼핑 주문확인 메일인지 판단하고, 맞다면 핵심 필드를
// 추출한다. Resend REST 호출(email.ts)과 같은 패턴으로 SDK 없이 fetch로 Claude Messages API를
// 직접 호출한다. 키가 없으면(로컬 개발 등) 호출을 건너뛰고 null을 반환한다.

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// 분류 + 짧은 필드 추출이라 가장 저렴/빠른 모델로 충분하다.
const MODEL = 'claude-haiku-4-5';
// 본문이 아무리 길어도 토큰/비용을 안전한 범위로 묶어둔다 — 주문 정보는 보통 메일 앞부분에 있다.
const MAX_BODY_CHARS = 6000;

export interface ExtractedOrder {
  isOrderConfirmation: boolean;
  itemName: string | null;
  /** yyyy-MM-dd */
  orderDate: string | null;
  /** yyyy-MM-dd — 정기배송이면 다음 배송일, 일반주문이면 예상 도착일 */
  expectedDeliveryDate: string | null;
  /** 상품 종류 추정 */
  estimatedType: 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY' | null;
  /** 반품/교환 기한이 메일 본문에 구체적으로 명시되어 있었는지. */
  foundExplicitDeadline: boolean;
  /** 주문일 기준 반품/교환 가능 일수. foundExplicitDeadline=false면 null. */
  returnDeadlineDays: number | null;
  /** RECURRING_DELIVERY일 때만 채운다: 배송 주기(일수). null이면 메일에 명시 안 됨. */
  intervalDays: number | null;
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
      description: 'yyyy-MM-dd 형식의 주문일/구독 신청일. 메일에 없으면 null.',
    },
    expectedDeliveryDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description:
        'yyyy-MM-dd 형식. 정기배송이면 "다음 배송일"을 최우선으로 추출(예: "다음 배송일: 2026-08-15"). 일반 주문이면 예상 도착일. 명시되지 않으면 null.',
    },
    estimatedType: {
      anyOf: [{ type: 'string', enum: ['ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY'] }, { type: 'null' }],
      description:
        '종류 추정. 아래 우선순위대로 판단해라.\n' +
        '1순위 RECURRING_DELIVERY: 메일에 "정기배송", "구독", "정기결제", "배송주기", "매월", "매주", "격주", "4주마다", "N일마다", "다음 배송일" 같은 반복 배송 키워드가 있으면 반드시 RECURRING_DELIVERY.\n' +
        '2순위 ELECTRONICS: 냉장고/TV/노트북/청소기 등 보증기간이 중요한 가전·전자제품.\n' +
        '3순위 ONLINE_ORDER: 위 두 조건에 해당하지 않는 일반 쇼핑몰 주문.\n' +
        'isOrderConfirmation=false면 null.',
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
        'estimatedType=RECURRING_DELIVERY일 때만 채운다: 배송 주기를 일수(정수)로 변환.\n' +
        '변환 기준: "매주"=7, "격주"=14, "3주마다"=21, "4주마다"/"28일마다"=28, ' +
        '"매월"/"한달마다"/"30일마다"=30, "6주마다"=42, "2달마다"/"격월"=60, ' +
        '"분기마다"/"3달마다"=90. 주기가 명시되지 않았거나 RECURRING_DELIVERY가 아니면 null.',
    },
  },
  required: ['isOrderConfirmation', 'itemName', 'orderDate', 'expectedDeliveryDate', 'estimatedType', 'foundExplicitDeadline', 'returnDeadlineDays', 'intervalDays'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `너는 이메일 포워딩으로 전달된 메일을 분류하고 핵심 정보를 추출하는 전문 파서다.

## 1단계: 메일 종류 판단 (isOrderConfirmation)
아래 중 하나면 true:
- 온라인 쇼핑몰 주문/결제 완료 확인 메일 (쿠팡, 네이버쇼핑, 무신사, 올리브영, 아마존 등)
- 정기배송 신청/구독 시작/구독 변경/구독 갱신 확인 메일

아래는 전부 false:
- 광고, 프로모션, 뉴스레터
- 배송 상태 업데이트 (배송 출발·도착 알림)
- "구매 확정해주세요" / "구매확정 요청" 메일 (배송 완료 후 확정 유도 메일)
- 설문·리뷰 요청
- OTP, 비밀번호 재설정, 기타 인증 메일

확신이 서지 않으면 false를 선택해라 — 애매하면 등록 대기 목록에 올리지 않는 쪽이 안전하다.

## 2단계: 종류 추정 (estimatedType) — 정기배송을 최우선으로 인식
isOrderConfirmation=true일 때:

**RECURRING_DELIVERY (최우선)**: 다음 키워드/패턴 중 하나라도 있으면 반드시 이 값:
- "정기배송", "정기결제", "정기구독", "구독", "구독 시작", "구독 변경"
- "배송 주기", "다음 배송일", "N일마다", "매월", "매주", "격주", "4주마다", "2달마다"
- "자동결제", "자동배송", "정기 할인"

**ELECTRONICS**: 냉장고, TV, 세탁기, 노트북, 청소기 등 보증기간이 중요한 가전·전자제품

**ONLINE_ORDER**: 위 두 가지에 해당하지 않는 일반 주문 (의류, 식품, 도서, 화장품 등)

## 3단계: 정기배송 주기 추출 (intervalDays)
RECURRING_DELIVERY로 판단했을 때, 배송 주기를 찾아 일수로 변환:
- "매주" → 7
- "격주" → 14
- "3주마다" → 21
- "4주마다" / "28일마다" → 28
- "매월" / "한달마다" / "30일마다" → 30
- "6주마다" → 42
- "2달마다" / "격월" → 60
- "분기마다" / "3달마다" → 90
주기가 메일에 명시되지 않았으면 null.

## 4단계: 날짜 추출
- orderDate: 주문일/구독 신청일 (yyyy-MM-dd)
- expectedDeliveryDate: 정기배송이면 **다음 배송일**을 최우선으로 추출. 일반 주문이면 예상 도착일.
  "다음 배송일", "첫 배송일", "배송 예정일" 같은 명확한 표현이 있으면 그 날짜를 사용.
- 명시되지 않은 날짜는 추측하지 말고 null로 남겨라. 날짜는 반드시 yyyy-MM-dd로 변환.

## 5단계: 반품기한 추출 (ONLINE_ORDER/ELECTRONICS만 실질적으로 의미 있음)
반품/교환 가능 기한이 구체적인 숫자 또는 날짜로 명시된 경우에만 foundExplicitDeadline=true.
없으면 false, returnDeadlineDays=null (서버가 법정 최소 기준으로 대체).

## 개인정보 보호
상품명, 날짜, 주기, 종류만 추출. 수령인 이름, 전화번호, 배송지 주소, 카드번호·결제수단은
절대 어떤 필드에도 포함하지 마라.`;

export async function extractOrderConfirmation(
  apiKey: string,
  subject: string,
  bodyText: string
): Promise<ExtractedOrder | null> {
  if (!apiKey) {
    console.warn('[email-extract] ANTHROPIC_API_KEY가 없어 파싱을 건너뜁니다');
    return null;
  }

  const truncatedBody = bodyText.length > MAX_BODY_CHARS ? `${bodyText.slice(0, MAX_BODY_CHARS)}…` : bodyText;

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
      messages: [
        {
          role: 'user',
          content: `제목: ${subject}\n\n본문:\n${truncatedBody}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email-extract] Claude API 호출 실패 (${res.status}): ${body}`);
    return null;
  }

  const data = await res.json<{ content: Array<{ type: string; text?: string }>; stop_reason: string }>();

  if (data.stop_reason === 'refusal') {
    console.warn('[email-extract] Claude가 이 메일 처리를 거부했습니다');
    return null;
  }

  const textBlock = data.content.find((block) => block.type === 'text' && block.text);
  if (!textBlock?.text) {
    console.error('[email-extract] 응답에 text 블록이 없습니다');
    return null;
  }

  try {
    return JSON.parse(textBlock.text) as ExtractedOrder;
  } catch (err) {
    console.error('[email-extract] JSON 파싱 실패', err, textBlock.text);
    return null;
  }
}

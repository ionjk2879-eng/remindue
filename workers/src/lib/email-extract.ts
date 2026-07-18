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
  /** yyyy-MM-dd — 예상 배송(도착) 일자 */
  expectedDeliveryDate: string | null;
  /** 상품 성격상 가장 알맞아 보이는 종류 추정(정기배송/전자제품 표현이 없으면 대부분 ONLINE_ORDER). */
  estimatedType: 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY' | null;
  /** 반품/교환 기한이 메일 본문에 구체적으로(일수 또는 날짜로) 명시되어 있었는지. */
  foundExplicitDeadline: boolean;
  /** 주문일 기준 반품/교환 가능 일수. foundExplicitDeadline=false면 null(서버에서 기본값으로 채운다). */
  returnDeadlineDays: number | null;
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    isOrderConfirmation: {
      type: 'boolean',
      description: '이 메일이 실제 온라인 쇼핑몰의 "주문/결제 완료" 확인 메일이면 true. 광고, 뉴스레터, 배송 외 안내, 다른 서비스 메일이면 false.',
    },
    itemName: { anyOf: [{ type: 'string' }, { type: 'null' }], description: '주문한 상품명(대표 상품 1개, 여러 개면 첫 번째 + 외 n건)' },
    orderDate: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'yyyy-MM-dd 형식의 주문일. 메일에 없으면 null.' },
    expectedDeliveryDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'yyyy-MM-dd 형식의 예상 배송일/도착일. 명시되어 있지 않으면 null.',
    },
    estimatedType: {
      anyOf: [{ type: 'string', enum: ['ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY'] }, { type: 'null' }],
      description:
        '상품 종류 추정. "정기배송", "구독", "N일마다 배송" 같은 표현이 있으면 RECURRING_DELIVERY. 냉장고/TV/노트북/청소기 등 보증기간이 중요한 가전·전자제품이면 ELECTRONICS. 그 외 일반 주문(반품기한이 중요)은 ONLINE_ORDER(기본값). isOrderConfirmation=false면 null.',
    },
    foundExplicitDeadline: {
      type: 'boolean',
      description:
        '반품/교환 가능 기한이 메일 본문에 구체적인 숫자(예: "7일 이내", "10일 이내") 또는 날짜(예: "2026-07-25까지")로 명시되어 있으면 true. 본문 어디에도 그런 구체적인 기한 정보가 없으면 false.',
    },
    returnDeadlineDays: {
      anyOf: [{ type: 'integer' }, { type: 'null' }],
      description:
        'foundExplicitDeadline=true일 때만 채운다: 주문일 기준 반품/교환 가능 일수. 메일에 "7일 이내"처럼 일수로 적혀 있으면 그 숫자 그대로, "2026-07-25까지"처럼 절대 날짜로 적혀 있으면 주문일과의 날짜 차이(일수)로 환산해서 넣는다. foundExplicitDeadline=false면 반드시 null.',
    },
  },
  required: ['isOrderConfirmation', 'itemName', 'orderDate', 'expectedDeliveryDate', 'estimatedType', 'foundExplicitDeadline', 'returnDeadlineDays'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `너는 이메일 포워딩으로 전달된 메일 하나를 검토하는 필터/추출기다.
이 메일이 온라인 쇼핑몰(쿠팡, 네이버쇼핑, 무신사, 올리브영, 아마존 등)의 "주문 완료" 또는
"결제 완료" 확인 메일인지 먼저 판단해라. 광고/프로모션/뉴스레터/배송 상태 업데이트(이미 지난
주문의 배송 시작·도착 알림)/설문·리뷰 요청/다른 서비스(택배, OTP, 뉴스 등) 메일은 전부
isOrderConfirmation=false로 판단하고 나머지 필드는 모두 null 또는 false로 채워라. 확신이 서지
않으면 false를 선택해라 — 애매하면 등록 대기 목록에 올리지 않는 쪽이 안전하다.
주문확인 메일이 맞을 때만 상품명/주문일/예상배송일/종류/반품기한을 메일 본문에서 찾아 채우고,
메일에 명시되지 않은 값은 추측하지 말고 null로 남겨라. 날짜는 반드시 yyyy-MM-dd로 변환해라.

반품기한(foundExplicitDeadline/returnDeadlineDays): 특정 문구를 찾는 방식이 아니라, 메일
본문 전체를 읽고 반품/교환 가능 기한이 구체적인 숫자(예: "7일 이내", "10일 이내") 또는
구체적인 날짜(예: "2026-07-25까지")로 명시되어 있는지 직접 판단해라. 그런 정보가 있으면
foundExplicitDeadline=true로 하고 returnDeadlineDays에 그 값(날짜라면 주문일과의 차이를
일수로 환산)을 채워라. 본문 어디에도 그런 구체적인 기한 정보가 없으면 foundExplicitDeadline=
false, returnDeadlineDays=null로 남겨라 — 이 경우 서버가 법정 최소 기준으로 대체하고
사용자에게 추정값이라고 안내하므로, 여기서 임의로 값을 추측해서 채우면 안 된다.

개인정보 보호: 상품명, 주문일자, 예상배송일, 종류 추정, 반품기한 관련 필드만 추출해라.
수령인 이름, 전화번호, 배송지 주소, 카드번호·결제수단 등 결제정보는 절대로 어떤 필드에도
포함하지 마라 — 특히 상품명(itemName) 필드에 수령인 이름이나 주소가 섞여 들어가지 않도록
주의해라.`;

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

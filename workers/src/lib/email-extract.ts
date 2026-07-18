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
  /** yyyy-MM-dd — 메일에 명시된 반품/교환 가능 기한 */
  returnDeadline: string | null;
  /** yyyy-MM-dd — 예상 배송(도착) 일자 */
  expectedDeliveryDate: string | null;
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
    returnDeadline: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'yyyy-MM-dd 형식의 반품/교환 가능 기한. 명시되어 있지 않으면 null.',
    },
    expectedDeliveryDate: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'yyyy-MM-dd 형식의 예상 배송일/도착일. 명시되어 있지 않으면 null.',
    },
  },
  required: ['isOrderConfirmation', 'itemName', 'orderDate', 'returnDeadline', 'expectedDeliveryDate'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `너는 이메일 포워딩으로 전달된 메일 하나를 검토하는 필터/추출기다.
이 메일이 온라인 쇼핑몰(쿠팡, 네이버쇼핑, 무신사, 올리브영, 아마존 등)의 "주문 완료" 또는
"결제 완료" 확인 메일인지 먼저 판단해라. 광고/프로모션/뉴스레터/배송 상태 업데이트(이미 지난
주문의 배송 시작·도착 알림)/설문·리뷰 요청/다른 서비스(택배, OTP, 뉴스 등) 메일은 전부
isOrderConfirmation=false로 판단하고 나머지 필드는 모두 null로 채워라. 확신이 서지 않으면
false를 선택해라 — 애매하면 등록 대기 목록에 올리지 않는 쪽이 안전하다.
주문확인 메일이 맞을 때만 상품명/주문일/반품기한/예상배송일을 메일 본문에서 찾아 채우고,
메일에 명시되지 않은 값은 추측하지 말고 null로 남겨라. 날짜는 반드시 yyyy-MM-dd로 변환해라.

개인정보 보호: 상품명, 주문일자, 반품기한, 예상배송일 네 가지만 추출해라. 수령인 이름,
전화번호, 배송지 주소, 카드번호·결제수단 등 결제정보는 절대로 어떤 필드에도 포함하지
마라 — 특히 상품명(itemName) 필드에 수령인 이름이나 주소가 섞여 들어가지 않도록 주의해라.`;

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

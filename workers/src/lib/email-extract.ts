// 이메일 포워딩으로 들어온 메일이 온라인 쇼핑 주문확인 메일인지 판단하고, 맞다면 핵심 필드를
// 추출한다. 실제 분류 기준/스키마/Claude 호출은 order-extraction.ts에 있다.

import { callExtractionApi, type ExtractedOrder } from './order-extraction';
import { todayDateOnly } from './date';

export type { ExtractedOrder };

// 본문이 아무리 길어도 토큰/비용을 안전한 범위로 묶어둔다 — 주문 정보는 보통 메일 앞부분에 있다.
const MAX_BODY_CHARS = 6000;

export async function extractOrderConfirmation(
  apiKey: string,
  subject: string,
  bodyText: string
): Promise<ExtractedOrder | null> {
  const truncatedBody = bodyText.length > MAX_BODY_CHARS ? `${bodyText.slice(0, MAX_BODY_CHARS)}…` : bodyText;

  // 오늘 날짜를 같이 넘긴다 — 연도 없이 월일만 적힌 예상 도착일("826" 등)을 올해로 해석하려면
  // 모델이 "오늘"을 알아야 한다(order-extraction.ts 5단계 날짜 표기 규칙 참고).
  return callExtractionApi(
    apiKey,
    [{ type: 'text', text: `오늘 날짜: ${todayDateOnly()}\n\n제목: ${subject}\n\n본문:\n${truncatedBody}` }],
    'email-extract'
  );
}

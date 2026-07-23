// 이메일 포워딩으로 들어온 메일이 온라인 쇼핑 주문확인 메일인지 판단하고, 맞다면 핵심 필드를
// 추출한다. 실제 분류 기준/스키마/Claude 호출은 order-extraction.ts에 있다 — 이미지 업로드
// (image-extract.ts)와 완전히 동일한 판단 로직을 공유한다. 여기서는 이메일 제목+본문을 텍스트
// content로 감싸는 역할만 한다.

import { callExtractionApi, type ExtractedOrder } from './order-extraction';

export type { ExtractedOrder };

// 본문이 아무리 길어도 토큰/비용을 안전한 범위로 묶어둔다 — 주문 정보는 보통 메일 앞부분에 있다.
const MAX_BODY_CHARS = 6000;

export async function extractOrderConfirmation(
  apiKey: string,
  subject: string,
  bodyText: string
): Promise<ExtractedOrder | null> {
  const truncatedBody = bodyText.length > MAX_BODY_CHARS ? `${bodyText.slice(0, MAX_BODY_CHARS)}…` : bodyText;

  return callExtractionApi(
    apiKey,
    [{ type: 'text', text: `제목: ${subject}\n\n본문:\n${truncatedBody}` }],
    'email-extract'
  );
}

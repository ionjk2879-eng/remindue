// 영수증/결제내역/구독 화면 스크린샷 이미지에서 주문확인 여부 + 핵심 필드를 추출한다.
// 이메일 파싱(email-extract.ts)과 완전히 동일한 분류 기준/스키마를 order-extraction.ts에서
// 공유한다 — 여기서는 base64 이미지를 Claude vision 입력 content로 감싸는 역할만 한다.

import { callExtractionApi, type ExtractedOrder, type ExtractionResult } from './order-extraction';

export type { ExtractedOrder, ExtractionResult };

export const ALLOWED_IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type AllowedImageMediaType = (typeof ALLOWED_IMAGE_MEDIA_TYPES)[number];

// base64 인코딩 전 기준 대략적인 원본 용량 상한 — 과도하게 큰 업로드로 인한 비용/지연 방지.
// base64는 원본보다 약 4/3배 커지므로, base64 문자열 길이 기준으로 환산해서 비교한다.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3);

export function isAllowedImageMediaType(mediaType: string): mediaType is AllowedImageMediaType {
  return (ALLOWED_IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType);
}

export function isImageTooLarge(base64Data: string): boolean {
  return base64Data.length > MAX_BASE64_CHARS;
}

/** 이메일 채널과 달리 라우트가 실패 이유를 dev 디버그용으로 그대로 노출하므로 ExtractionResult를 통째로 반환한다. */
export async function extractOrderFromImage(
  apiKey: string,
  base64Data: string,
  mediaType: AllowedImageMediaType
): Promise<ExtractionResult> {
  return callExtractionApi(
    apiKey,
    [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
      {
        type: 'text',
        text: '이 이미지(영수증 또는 결제내역/구독 화면 스크린샷)에서 주문확인 여부와 핵심 필드를 추출해라.',
      },
    ],
    'image-extract'
  );
}

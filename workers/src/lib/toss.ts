// 토스페이먼츠 REST API — email.ts(Resend)와 동일하게 SDK 없이 fetch로 직접 호출한다.
// 인증 방식만 다르다: Authorization: Basic base64(시크릿키 + ":") — 시크릿키를 아이디로,
// 비밀번호는 빈 문자열로 인코딩한다(토스 고유 관례, Bearer 아님).

import { toBase64 } from './base64';

const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

export class TossApiError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly httpStatus: number
  ) {
    super(message);
  }
}

function tossAuthHeader(secretKey: string): string {
  return 'Basic ' + toBase64(new TextEncoder().encode(`${secretKey}:`));
}

async function tossFetch<T>(path: string, secretKey: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TOSS_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: tossAuthHeader(secretKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);

  if (!res.ok) {
    const message = typeof json.message === 'string' ? json.message : `토스페이먼츠 API 호출 실패 (${res.status})`;
    const code = typeof json.code === 'string' ? json.code : undefined;
    console.error(`[toss] ${path} 실패 (${res.status}, ${code ?? 'NO_CODE'}): ${message}`);
    throw new TossApiError(message, code, res.status);
  }

  return json as T;
}

export interface TossPaymentResult {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string;
}

/** 일반 결제(1회성) 승인 — 결제창에서 리다이렉트로 돌아온 paymentKey/orderId/amount로 확정한다. */
export function confirmPayment(
  secretKey: string,
  params: { paymentKey: string; orderId: string; amount: number }
): Promise<TossPaymentResult> {
  return tossFetch<TossPaymentResult>('/payments/confirm', secretKey, params);
}

export interface TossBillingKeyResult {
  billingKey: string;
  customerKey: string;
  cardCompany?: string;
  cardNumber?: string;
}

/** 정기결제 카드 등록 — 빌링 인증 위젯에서 리다이렉트로 돌아온 authKey/customerKey로 빌링키를 발급받는다. */
export function issueBillingKey(
  secretKey: string,
  params: { authKey: string; customerKey: string }
): Promise<TossBillingKeyResult> {
  return tossFetch<TossBillingKeyResult>('/billing/authorizations/issue', secretKey, params);
}

/**
 * 빌링키로 실제 청구. 토스는 빌링키를 자동으로 주기 청구하지 않으므로, 최초 결제 직후와
 * 이후 매 갱신 주기마다 이 함수를 우리 서버(크론)가 직접 호출해야 한다.
 */
export function chargeBillingKey(
  secretKey: string,
  billingKey: string,
  params: { customerKey: string; amount: number; orderId: string; orderName: string }
): Promise<TossPaymentResult> {
  return tossFetch<TossPaymentResult>(`/billing/${billingKey}`, secretKey, params);
}

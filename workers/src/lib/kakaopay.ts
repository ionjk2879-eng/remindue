// 카카오페이 온라인결제 API(신규, Secret Key 방식) — 토스와 마찬가지로 SDK 없이 fetch로 직접
// 호출한다. 인증은 `Authorization: SECRET_KEY {secretKey}` 헤더(구 Admin Key 방식이 카카오페이
// 공지로 폐지되어 이 방식으로 전환됨).

const KAKAOPAY_API_BASE = 'https://open-api.kakaopay.com/online/v1/payment';

export class KakaoPayApiError extends Error {
  constructor(
    message: string,
    public readonly code: string | number | undefined,
    public readonly httpStatus: number
  ) {
    super(message);
  }
}

async function kakaoFetch<T>(path: string, secretKey: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${KAKAOPAY_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `SECRET_KEY ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await res.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);

  if (!res.ok) {
    const message = typeof json.error_message === 'string' ? json.error_message : `카카오페이 API 호출 실패 (${res.status})`;
    const code = typeof json.error_code === 'string' || typeof json.error_code === 'number' ? json.error_code : undefined;
    console.error(`[kakaopay] ${path} 실패 (${res.status}, ${code ?? 'NO_CODE'}): ${message}`);
    throw new KakaoPayApiError(message, code, res.status);
  }

  return json as T;
}

export interface KakaoReadyResult {
  tid: string;
  next_redirect_pc_url: string;
  next_redirect_mobile_url: string;
  created_at: string;
}

/** 결제 준비 — 성공하면 tid를 받고, 사용자를 next_redirect_*_url로 리다이렉트해 카카오페이 결제창을 띄운다. */
export function readyPayment(
  secretKey: string,
  params: {
    cid: string;
    partnerOrderId: string;
    partnerUserId: string;
    itemName: string;
    quantity: number;
    totalAmount: number;
    taxFreeAmount: number;
    approvalUrl: string;
    cancelUrl: string;
    failUrl: string;
  }
): Promise<KakaoReadyResult> {
  return kakaoFetch<KakaoReadyResult>('/ready', secretKey, {
    cid: params.cid,
    partner_order_id: params.partnerOrderId,
    partner_user_id: params.partnerUserId,
    item_name: params.itemName,
    quantity: params.quantity,
    total_amount: params.totalAmount,
    tax_free_amount: params.taxFreeAmount,
    approval_url: params.approvalUrl,
    cancel_url: params.cancelUrl,
    fail_url: params.failUrl,
  });
}

export interface KakaoApproveResult {
  aid: string;
  tid: string;
  cid: string;
  partner_order_id: string;
  partner_user_id: string;
  payment_method_type: string;
  amount: { total: number };
  approved_at: string;
}

/** 결제 승인 — 사용자가 카카오톡/카카오페이에서 인증을 마치고 approval_url로 돌아올 때 받은 pg_token으로 확정한다. */
export function approvePayment(
  secretKey: string,
  params: { cid: string; tid: string; partnerOrderId: string; partnerUserId: string; pgToken: string }
): Promise<KakaoApproveResult> {
  return kakaoFetch<KakaoApproveResult>('/approve', secretKey, {
    cid: params.cid,
    tid: params.tid,
    partner_order_id: params.partnerOrderId,
    partner_user_id: params.partnerUserId,
    pg_token: params.pgToken,
  });
}

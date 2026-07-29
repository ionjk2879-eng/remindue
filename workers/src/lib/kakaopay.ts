// 카카오페이 온라인결제 API(신규, Secret Key 방식) — 토스와 마찬가지로 SDK 없이 fetch로 직접
// 호출한다. 인증은 `Authorization: SECRET_KEY {secretKey}` 헤더(구 Admin Key 방식이 카카오페이
// 공지로 폐지되어 이 방식으로 전환됨).

const KAKAOPAY_API_BASE = 'https://open-api.kakaopay.com/online/v1/payment';

/**
 * 카카오페이가 가맹점 심사 전에 공개로 제공하는 테스트 전용 CID(단건/정기). 실 심사 통과 후
 * wrangler.jsonc의 KAKAOPAY_CID/KAKAOPAY_SUBSCRIPTION_CID를 실 가맹점 코드로 바꾸고 나면 이
 * 값과 더 이상 일치하지 않아야 한다 — routes/billing-kakao.ts가 프로덕션에서 이 값과 여전히
 * 같으면 경고 로그를 남겨서, CID 교체를 잊은 채로 계속 운영되는 걸 눈치채게 한다.
 */
export const KAKAOPAY_PUBLIC_TEST_CIDS: ReadonlySet<string> = new Set(['TC0ONETIME', 'TCSUBSCRIP']);

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
  sid?: string; // 정기결제 CID로 준비/승인한 경우에만 내려온다 — 이후 청구/해지에 계속 쓰는 구독 식별자.
  partner_order_id: string;
  partner_user_id: string;
  payment_method_type: string;
  amount: { total: number };
  approved_at: string;
}

/**
 * 결제 승인 — 사용자가 카카오톡/카카오페이에서 인증을 마치고 approval_url로 돌아올 때 받은
 * pg_token으로 확정한다. 단건/정기 공용 — cid로 어떤 결제인지 갈린다. 정기결제 CID로 호출하면
 * 이 승인이 곧 "구독 등록 + 첫 회차 결제"이고, 응답의 sid를 앞으로의 청구/해지에 계속 쓴다.
 */
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

export interface KakaoSubscriptionChargeResult {
  aid: string;
  tid: string;
  cid: string;
  sid: string;
  amount: { total: number };
  approved_at: string;
}

/** 정기결제 청구 — 사용자 상호작용 없이 서버가 등록된 결제수단(sid)으로 매 주기 직접 청구한다. */
export function chargeSubscription(
  secretKey: string,
  params: {
    cid: string;
    sid: string;
    partnerOrderId: string;
    partnerUserId: string;
    itemName: string;
    quantity: number;
    totalAmount: number;
    taxFreeAmount: number;
  }
): Promise<KakaoSubscriptionChargeResult> {
  return kakaoFetch<KakaoSubscriptionChargeResult>('/subscription', secretKey, {
    cid: params.cid,
    sid: params.sid,
    partner_order_id: params.partnerOrderId,
    partner_user_id: params.partnerUserId,
    item_name: params.itemName,
    quantity: params.quantity,
    total_amount: params.totalAmount,
    tax_free_amount: params.taxFreeAmount,
  });
}

/** 정기결제 해지 — 이후로는 sid로 청구를 시도해도 실패한다. */
export function inactivateSubscription(
  secretKey: string,
  params: { cid: string; sid: string }
): Promise<{ aid: string; cid: string; sid: string; status: string }> {
  return kakaoFetch('/manage/subscription/inactive', secretKey, {
    cid: params.cid,
    sid: params.sid,
  });
}

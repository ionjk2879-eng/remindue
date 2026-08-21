import { apiClient } from './client';
import type { BillingPlan, BillingStatus, CheckoutResponse } from '../types';

export async function fetchBillingStatus() {
  const { data } = await apiClient.get<BillingStatus>('/billing/status');
  return data;
}

export async function createCheckout(plan: BillingPlan) {
  const { data } = await apiClient.post<CheckoutResponse>('/billing/checkout', { plan });
  return data;
}

export async function confirmPayment(params: { paymentKey: string; orderId: string; amount: number }) {
  const { data } = await apiClient.post<BillingStatus>('/billing/confirm', params);
  return data;
}

export async function issueBillingKey(params: { authKey: string; customerKey: string; plan: BillingPlan }) {
  const { data } = await apiClient.post<BillingStatus>('/billing/billing-key/issue', params);
  return data;
}

export async function cancelSubscription() {
  const { data } = await apiClient.post<BillingStatus>('/billing/cancel');
  return data;
}

/** 카카오페이 단건결제 준비 — 지금은 심사 전 테스트 CID(TC0ONETIME)로만 동작해 1회성 결제만 지원한다. */
export async function createKakaoCheckout() {
  const { data } = await apiClient.post<{ redirectUrlPc: string; redirectUrlMobile: string }>('/kakao-billing/checkout');
  return data;
}

/** 카카오페이 월 정기결제 등록 준비 — 심사 전 테스트 CID(TCSUBSCRIP)를 사용한다. */
export async function createKakaoSubscribeCheckout(plan: 'MONTHLY') {
  const { data } = await apiClient.post<{ redirectUrlPc: string; redirectUrlMobile: string }>('/kakao-billing/subscribe', { plan });
  return data;
}

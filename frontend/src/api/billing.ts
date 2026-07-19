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

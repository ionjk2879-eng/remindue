import { apiClient } from './client';
import type { PendingPurchasesResponse } from '../types';

export async function fetchPendingPurchases() {
  const { data } = await apiClient.get<PendingPurchasesResponse>('/pending-purchases');
  return data;
}

export async function confirmPendingPurchase(id: number) {
  await apiClient.post(`/pending-purchases/${id}/confirm`);
}

export async function ignorePendingPurchase(id: number) {
  await apiClient.post(`/pending-purchases/${id}/ignore`);
}

/** 가격 인상 감지 항목 전용 — 기존 항목의 금액을 이번에 추출된 금액으로 갱신한다. */
export async function applyPriceChange(id: number) {
  await apiClient.post(`/pending-purchases/${id}/apply-price-change`);
}

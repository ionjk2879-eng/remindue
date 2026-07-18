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

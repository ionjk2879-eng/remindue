import { apiClient } from './client';
import type { Purchase, PurchaseInput } from '../types';

export async function fetchPurchases() {
  const { data } = await apiClient.get<Purchase[]>('/purchases');
  return data;
}

export async function createPurchase(input: PurchaseInput) {
  const { data } = await apiClient.post<Purchase>('/purchases', input);
  return data;
}

export async function updatePurchase(id: number, input: PurchaseInput) {
  const { data } = await apiClient.put<Purchase>(`/purchases/${id}`, input);
  return data;
}

export async function deletePurchase(id: number) {
  await apiClient.delete(`/purchases/${id}`);
}

export async function markDelivered(id: number) {
  const { data } = await apiClient.post<Purchase>(`/purchases/${id}/mark-delivered`);
  return data;
}

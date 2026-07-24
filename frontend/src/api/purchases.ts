import { apiClient } from './client';
import type { Purchase, PurchaseInput } from '../types';

export async function fetchPurchases(options?: { archived?: boolean }) {
  const { data } = await apiClient.get<Purchase[]>('/purchases', {
    params: options?.archived ? { archived: 'true' } : undefined,
  });
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

export async function archivePurchase(id: number) {
  const { data } = await apiClient.post<Purchase>(`/purchases/${id}/archive`);
  return data;
}

export async function unarchivePurchase(id: number) {
  const { data } = await apiClient.post<Purchase>(`/purchases/${id}/unarchive`);
  return data;
}

export interface AiSummaryInput {
  month: number;
  recurringDeliveryCount: number;
  subscriptionCount: number;
  monthlySpend: number;
  yearlySpend: number;
  monthTrendPercent: number | null;
  topCategory: string | null;
  topCategoryAmount: number | null;
  reviewCount: number;
  totalItems: number;
}

export async function fetchAiSummary(input: AiSummaryInput): Promise<string | null> {
  const { data } = await apiClient.post<{ summary: string | null }>('/ai/spending-summary', input);
  return data.summary;
}

/** CSV/PDF는 인증 헤더가 필요해서 <a href>로 바로 열 수 없다 — blob으로 받아서 임시 링크를 만들어 다운로드를 트리거한다. */
export async function downloadExport(format: 'csv' | 'pdf') {
  const { data } = await apiClient.get<Blob>('/purchases/export', {
    params: { format },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remindue_export.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

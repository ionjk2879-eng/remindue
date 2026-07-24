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
  /** 가장 가까운 다음 결제/배송 예정일·항목명. AI가 코멘트에서 언급할 수 있게 넘겨준다 — 있는
   *  그대로만 인용해야 하는 값이라 서버 프롬프트에서 "지어내지 마라"로 못박아둔다. */
  nextPaymentDate: string | null;
  nextPaymentItem: string | null;
  /** 확인 대기 목록에서 가격 인상이 감지된 항목명 목록. 없으면 빈 배열. */
  priceIncreaseItems: string[];
}

export interface AiBriefSections {
  goodNews: string | null;
  attention: string | null;
  insight: string | null;
}

export async function fetchAiSummary(input: AiSummaryInput): Promise<AiBriefSections> {
  const { data } = await apiClient.post<AiBriefSections>('/ai/spending-summary', input);
  return data;
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

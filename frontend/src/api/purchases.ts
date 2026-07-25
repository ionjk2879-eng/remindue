import { apiClient } from './client';
import type { Purchase, PurchaseInput } from '../types';

export async function fetchPurchases(options?: { archived?: boolean }) {
  const { data } = await apiClient.get<Purchase[]>('/purchases', {
    params: options?.archived ? { archived: 'true' } : undefined,
  });
  return data;
}

/** 월별/연간 지출 집계 전용 — 활성+보관+삭제(discard) 전부 포함(하드 삭제/"취소"만 제외).
 *  카드로 렌더링하지 않고 지출 합산에만 쓴다. */
export async function fetchPurchasesForSpendHistory() {
  const { data } = await apiClient.get<Purchase[]>('/purchases', { params: { scope: 'spend' } });
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

/** "취소" — 하드 삭제, 지출 통계에서도 완전히 빠진다. */
export async function deletePurchase(id: number) {
  await apiClient.delete(`/purchases/${id}`);
}

/** "삭제" — 목록에서는 빠지지만 실제 지출로서 월별/연간 통계에는 계속 집계된다. */
export async function discardPurchase(id: number) {
  await apiClient.post(`/purchases/${id}/discard`);
}

export async function markDelivered(id: number) {
  const { data } = await apiClient.post<Purchase>(`/purchases/${id}/mark-delivered`);
  return data;
}

/** "유지하기"를 여러 건 한 번에 — 확인이 필요한 항목을 하나씩 누르는 불편을 줄이기 위한 일괄 처리. */
export async function confirmAllDelivered(ids: number[]) {
  const { data } = await apiClient.post<Purchase[]>('/purchases/confirm-all', { ids });
  return data;
}

/** "유지 안 함" — 더 이상 안 쓴다고 명시적으로 표시(discontinuedAt 채움). 미확인(침묵)과는 다르다. */
export async function discontinuePurchase(id: number) {
  const { data } = await apiClient.post<Purchase>(`/purchases/${id}/discontinue`);
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
  /** 최다 카테고리가 이번 달 정기 지출에서 차지하는 비중(%). 소비가 한쪽에 쏠렸는지 AI가
   *  판단할 수 있게 넘겨준다 — 없으면(카테고리 자체가 없으면) null. */
  topCategoryShare: number | null;
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

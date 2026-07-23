import { apiClient } from './client';
import type { PendingPurchase, Purchase, PurchaseInput } from '../types';

/** File -> base64(data URL 접두사 제거) — 서버로 넘길 이미지 페이로드. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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

/** 사진(영수증/결제내역 스크린샷)으로 등록 — 이메일 자동등록과 동일하게 결과는 확인 대기 목록에 추가된다. */
export async function analyzeImage(file: File) {
  const image = await fileToBase64(file);
  const { data } = await apiClient.post<PendingPurchase>('/purchases/analyze-image', {
    image,
    mediaType: file.type,
  });
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

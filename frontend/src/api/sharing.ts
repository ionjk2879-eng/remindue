import { apiClient } from './client';
import type { Purchase, SharedAccess } from '../types';

export async function inviteMember(email: string) {
  const { data } = await apiClient.post<{ invited: string }>('/sharing/invite', { email });
  return data;
}

export async function fetchSentInvites() {
  const { data } = await apiClient.get<SharedAccess[]>('/sharing/sent');
  return data;
}

export async function fetchReceivedInvites() {
  const { data } = await apiClient.get<SharedAccess[]>('/sharing/received');
  return data;
}

export async function acceptInvite(id: number) {
  const { data } = await apiClient.post<{ id: number; status: string }>(`/sharing/${id}/accept`);
  return data;
}

export async function revokeShare(id: number) {
  await apiClient.delete(`/sharing/${id}`);
}

export async function fetchSharedPurchases(id: number) {
  const { data } = await apiClient.get<Purchase[]>(`/sharing/${id}/purchases`);
  return data;
}

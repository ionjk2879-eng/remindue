import { apiClient } from './client';
import type { FeedbackDetail, FeedbackInput, FeedbackListItem, FeedbackStatus } from '../types';

export async function fetchFeedbackList() {
  const { data } = await apiClient.get<FeedbackListItem[]>('/feedback');
  return data;
}

export async function createFeedback(input: FeedbackInput) {
  const { data } = await apiClient.post<FeedbackDetail>('/feedback', input);
  return data;
}

export async function fetchFeedbackDetail(id: number) {
  const { data } = await apiClient.get<FeedbackDetail>(`/feedback/${id}`);
  return data;
}

export async function updateFeedback(id: number, input: FeedbackInput) {
  const { data } = await apiClient.put<FeedbackDetail>(`/feedback/${id}`, input);
  return data;
}

export async function deleteFeedback(id: number) {
  await apiClient.delete(`/feedback/${id}`);
}

/** status는 운영자가 답글과 함께 상태를 바꿀 때만 실어 보낸다 — 글쓴이 답글에는 undefined. */
export async function replyToFeedback(id: number, content: string, status?: FeedbackStatus) {
  const { data } = await apiClient.post<FeedbackDetail>(`/feedback/${id}/replies`, { content, status });
  return data;
}

export async function updateFeedbackReply(id: number, replyId: number, content: string) {
  const { data } = await apiClient.put<FeedbackDetail>(`/feedback/${id}/replies/${replyId}`, { content });
  return data;
}

export async function deleteFeedbackReply(id: number, replyId: number) {
  const { data } = await apiClient.delete<FeedbackDetail>(`/feedback/${id}/replies/${replyId}`);
  return data;
}

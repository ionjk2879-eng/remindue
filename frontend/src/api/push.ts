import { apiClient } from './client';

export async function fetchVapidPublicKey() {
  const { data } = await apiClient.get<{ publicKey: string }>('/push/vapid-public-key');
  return data.publicKey;
}

export async function subscribePush(subscription: PushSubscriptionJSON) {
  await apiClient.post('/push/subscribe', subscription);
}

export async function unsubscribePush(endpoint: string) {
  await apiClient.post('/push/unsubscribe', { endpoint });
}

/** "오늘 받으셨나요?" 알림에서 "받았어요" 탭 후 대시보드 모달의 오늘/하루전/이틀전 선택 — 인증 없이
 *  토큰만으로 처리된다(routes/push.ts). daysAgo만큼 이전 날짜가 새 스케줄 앵커로 확정된다. */
export async function confirmArrival(token: string, daysAgo: 0 | 1 | 2) {
  await apiClient.post('/push/confirm-arrival', { token, daysAgo });
}

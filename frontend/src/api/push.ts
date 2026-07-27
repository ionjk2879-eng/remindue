import { apiClient } from './client';
import { getNotificationPermission, isPushSupported, urlBase64ToUint8Array } from '../lib/push';

export async function fetchVapidPublicKey() {
  const { data } = await apiClient.get<{ publicKey: string }>('/push/vapid-public-key');
  return data.publicKey;
}

export async function subscribePush(subscription: PushSubscriptionJSON) {
  await apiClient.post('/push/subscribe', subscription);
}

/** 권한만 수동 허용된 경우에도 실제 구독을 만들고 현재 계정에 연결한다. */
export async function ensurePushSubscription(requestPermission = false) {
  if (!isPushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않습니다.');

  let permission = await getNotificationPermission();
  if (permission === 'default' && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return null;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await fetchVapidPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await subscribePush(subscription.toJSON());
  return subscription;
}

export async function unsubscribePush(endpoint: string) {
  await apiClient.post('/push/unsubscribe', { endpoint });
}

export type PushTestKind = 'DEADLINE' | 'RENEWAL' | 'ARRIVAL' | 'WEEKLY_SUMMARY';

export async function sendTestPush(kind?: PushTestKind) {
  const { data } = await apiClient.post<{ sent: number }>('/push/test', kind ? { kind } : {});
  return data;
}

/** "오늘 받으셨나요?" 알림에서 "받았어요" 탭 후 대시보드 모달의 오늘/하루전/이틀전 선택 — 인증 없이
 *  토큰만으로 처리된다(routes/push.ts). daysAgo만큼 이전 날짜가 새 스케줄 앵커로 확정된다. */
export async function confirmArrival(token: string, daysAgo: number) {
  await apiClient.post('/push/confirm-arrival', { token, daysAgo });
}

/** 대시보드의 도착 확인 카드에서, 로그인한 사용자가 본인 항목의 실제 도착일을 확정한다. */
export async function confirmArrivalForPurchase(id: number, daysAgo: number) {
  await apiClient.post(`/push/arrival-check/${id}/confirm`, { daysAgo });
}

/** 묶인 배송 알림에서 일부만 받은 경우, 선택한 항목만 실제 도착일로 확정한다. */
export async function confirmArrivalBatch(token: string, received: { id: number; daysAgo: number }[]) {
  await apiClient.post('/push/arrival-batch/partial', { token, received });
}

/** 묶인 유지 확인에서 선택한 항목만 유지하고, 나머지는 유지 안 함으로 처리한다. */
export async function confirmRecurringBatch(token: string, maintainedIds: number[]) {
  await apiClient.post('/push/recurring-batch/partial', { token, maintainedIds });
}

/** 아직 도착하지 않았다면 다음 날 다시 묻도록 설정한다. */
export async function snoozeArrivalForPurchase(id: number) {
  await apiClient.post(`/push/arrival-check/${id}/snooze`);
}

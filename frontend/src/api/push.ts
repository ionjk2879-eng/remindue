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

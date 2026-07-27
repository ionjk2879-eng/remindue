/** VAPID 공개키(URL-safe base64)를 pushManager.subscribe()가 요구하는 Uint8Array로 변환한다. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Chrome 설정 화면에서 바뀐 최신 권한을 읽는다. 지원하지 않으면 기존 API로 폴백한다. */
export async function getNotificationPermission(): Promise<NotificationPermission> {
  if ('permissions' in navigator) {
    try {
      const status = await navigator.permissions.query({ name: 'notifications' });
      return status.state === 'prompt' ? 'default' : status.state;
    } catch {
      // Safari 등 notifications 조회를 지원하지 않는 브라우저는 아래 값을 사용한다.
    }
  }
  return Notification.permission;
}

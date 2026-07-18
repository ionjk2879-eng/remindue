/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// 오프라인 자산 캐싱(workbox precaching)은 이 PWA의 목적이 아니라서 쓰지 않는다 —
// 목적은 설치 가능성 + 푸시 알림이라 이 서비스 워커는 그 두 이벤트만 다룬다.
// 다만 vite-plugin-pwa(injectManifest)가 빌드 후 산출물에서 이 리터럴 문자열을 찾아
// 치환하므로(빈 프리캐시 배열이 됨) 남겨둔다. console.log로 감싸 minify 과정에서
// 죽은 코드로 제거되지 않게 한다(단순 프로퍼티 참조는 부작용이 없어 제거될 수 있음).
console.log('[sw] precache manifest entries:', self.__WB_MANIFEST.length);

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  const data: PushPayload = event.data ? event.data.json() : {};
  const title = data.title ?? 'Remindue';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: data.url ?? '/' },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() =>
      // 포그라운드에 열려있는 탭에도 수신 사실을 알려준다(수동 테스트 확인용으로도 사용).
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'push-received', title, body: options.body }));
      })
    )
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';

/**
 * 브라우저가 구독을 스스로 무효화/회전시켰을 때(예: 사용자가 알림 권한을 껐을 때) 발생.
 * 다음 발송 시도의 404/410로 뒤늦게(다음날 크론) 정리되는 걸 기다리지 않고, 이 자리에서
 * 바로 서버에 정리를 요청한다. 재구독은 시도하지 않는다 — 서비스 워커는 로그인한
 * 사용자의 accessToken에 접근할 수 없어 새 구독을 다시 사용자에게 연결(subscribe)할
 * 방법이 없기 때문에, 다음에 앱을 열었을 때 배너를 통해 다시 구독하도록 둔다.
 */
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const oldEndpoint = (event as unknown as { oldSubscription?: PushSubscription }).oldSubscription?.endpoint;
  if (!oldEndpoint) return;

  event.waitUntil(
    fetch(`${API_BASE}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: oldEndpoint }),
    }).catch(() => {})
  );
});

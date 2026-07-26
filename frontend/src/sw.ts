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
  /** "유지하기"/"나중에" 같은 액션 버튼 — 지원 안 하는 플랫폼(iOS Safari 등)에서는 그냥
   *  무시되고 본문 탭 시 기본 동작(앱 열기)만 동작한다. */
  actions?: { action: string; title: string }[];
  /** actions와 짝을 이루는 1회성 토큰 — "유지하기" 눌렀을 때 인증 없이 확인 처리하는 데 쓴다. */
  actionToken?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';

self.addEventListener('push', (event: PushEvent) => {
  const data: PushPayload = event.data ? event.data.json() : {};
  const title = data.title ?? 'Remindue';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: data.url ?? '/', actionToken: data.actionToken },
    ...(data.actions ? { actions: data.actions } : {}),
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
  const notifData = event.notification.data as { url?: string; actionToken?: string } | undefined;

  // "나중에" — 그냥 닫기만 하고 앱은 열지 않는다.
  if (event.action === 'later') return;

  // "유지하기" — 로그인 세션 없이(pushsubscriptionchange와 같은 이유) 토큰만으로 바로 확인
  // 처리한다. 앱을 열 필요가 없어서 openWindow도 생략한다.
  if (event.action === 'confirm' && notifData?.actionToken) {
    event.waitUntil(
      fetch(`${API_BASE}/push/confirm-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: notifData.actionToken }),
      }).catch(() => {})
    );
    return;
  }

  // 묶인 배송의 "모두 받음"은 오늘 수령으로 즉시 처리한다.
  if (event.action === 'arrival_all_received' && notifData?.actionToken) {
    event.waitUntil(
      fetch(`${API_BASE}/push/arrival-batch/all-received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: notifData.actionToken }),
      }).catch(() => {})
    );
    return;
  }

  // "아직요"는 묶인 항목 전부를 내일 다시 물어본다. 대시보드에는 오늘도 남아 있어
  // 알림을 닫은 뒤 도착한 물건을 바로 처리할 수 있다.
  if (event.action === 'arrival_not_yet' && notifData?.actionToken) {
    event.waitUntil(
      fetch(`${API_BASE}/push/arrival-batch/snooze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: notifData.actionToken }),
      }).catch(() => {})
    );
    return;
  }

  if ((event.action === 'recurring_all_maintain' || event.action === 'recurring_all_discontinue') && notifData?.actionToken) {
    const action = event.action === 'recurring_all_maintain' ? 'all-maintain' : 'all-discontinue';
    event.waitUntil(
      fetch(`${API_BASE}/push/recurring-batch/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: notifData.actionToken }),
      }).catch(() => {})
    );
    return;
  }

  // "일부 받음"은 받은 물건과 수령일을 골라야 해서 액션 버튼
  // 하나로 끝낼 수 없다 — 아래 기본 동작(대시보드 열기)으로 자연스럽게 넘어간다. url에 이미
  // ?confirmArrival=<토큰>이 붙어 있어(arrival-confirm.ts) 대시보드가 열리면 그 후속 질문 모달을
  // 띄운다. 액션 버튼 없이 알림 본문을 탭한 기본 동작도 동일하게 대시보드를 연다.
  const url = notifData?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});

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

// 네이티브(Capacitor) 환경 감지 및 플러그인 초기화 유틸리티.
// 웹에서 import해도 no-op으로 동작하므로 조건 분기 없이 사용 가능.

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { apiOrigin } from '../api/client';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/** 앱 시작 시 1회 호출 — 상태바 스타일링만 한다(스플래시는 hideSplash로 별도 처리). */
export async function initNative(): Promise<void> {
  if (!isNative) return;

  // CSS safe-area 패딩 활성화
  document.body.classList.add('is-native');

  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#F5F5F0' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    // 일부 기기에서 StatusBar가 없을 수 있음
  }
}

/**
 * 스플래시 화면을 숨긴다 — initNative와 분리해둔 이유는, 로그인 여부 확인(AuthContext의
 * isInitializing)이 끝나기 전에 스플래시를 내려버리면 그 짧은 순간 대시보드로 리다이렉트되기
 * 전의 로그인/랜딩 화면이 한 프레임 노출됐다가 사라지는 깜빡임이 생기기 때문이다. 인증 확인이
 * 끝난 뒤(NativeInitializer가 호출) 스플래시를 내려야 로그인된 사용자는 스플래시에서 곧바로
 * 대시보드로 이어진다.
 */
export async function hideSplash(): Promise<void> {
  if (!isNative) return;
  await SplashScreen.hide({ fadeOutDuration: 300 });
}

/** Android 뒤로가기 버튼 처리 — 히스토리 없으면 앱 종료 */
export function setupBackButton(): () => void {
  if (!isNative) return () => {};

  const handle = App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  return () => { handle.then((h) => h.remove()); };
}

export type NativePushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unsupported';

/**
 * 설정 화면의 "알림 켜기" 상태 표시용 — OS 다이얼로그를 띄우지 않고 현재 권한 상태만 확인한다.
 * 'denied'는 한 번 거부된 뒤로는 앱에서 다시 요청해도 다이얼로그가 안 뜨는 상태라, 이 경우엔
 * 기기 설정으로 안내하는 수밖에 없다(requestPermissions를 다시 불러도 소용없음).
 */
export async function getNativePushPermissionStatus(): Promise<NativePushPermissionStatus> {
  if (!isNative) return 'unsupported';
  try {
    const status = await PushNotifications.checkPermissions();
    return status.receive === 'granted' || status.receive === 'denied' ? status.receive : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** register() 호출 후 FCM 토큰이 오길 기다린다 — 권한이 이미 granted인 상태에서만 불러야 한다. */
async function registerAndAwaitToken(): Promise<string | null> {
  await PushNotifications.register();

  return new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10_000);

    PushNotifications.addListener('registration', (token) => {
      clearTimeout(timeout);
      resolve(token.value);
    });

    PushNotifications.addListener('registrationError', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

/**
 * 네이티브 푸시 알림 권한을 요청(OS 다이얼로그 노출)하고 토큰을 등록한다 — 토큰 문자열 반환,
 * 실패 시 null. 사용자가 명시적으로 누른 버튼(설정 화면의 "알림 켜기") 안에서만 호출해야 한다 —
 * 앱 시작 시 자동으로 부르면 사용자가 준비되기 전에 다이얼로그가 뜨고, 얼결에 거부하면 이후로는
 * 앱에서 다시 물어볼 방법이 없어진다. 자동 호출용은 registerNativePushIfGranted를 대신 쓴다.
 */
export async function registerNativePush(): Promise<string | null> {
  if (!isNative) return null;

  try {
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== 'granted') return null;

    return await registerAndAwaitToken();
  } catch {
    return null;
  }
}

/**
 * 앱 시작 시 자동 호출용 — 이미 권한이 허용된 경우에만 토큰을 (재)등록하고, 'prompt' 상태여도
 * 절대 OS 다이얼로그를 띄우지 않는다. 권한 요청은 설정 화면의 "알림 켜기" 버튼(registerNativePush)
 * 에서만 일어나야 한다.
 */
export async function registerNativePushIfGranted(): Promise<string | null> {
  if (!isNative) return null;

  try {
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== 'granted') return null;

    return await registerAndAwaitToken();
  } catch {
    return null;
  }
}

/**
 * 알림(본문 또는 "일부 유지"처럼 앱을 열어야 하는 액션 버튼)을 탭해 앱이 열렸을 때, 알림에
 * 실려온 url(예: /dashboard?confirmRecurringBatch=...)로 라우팅한다. 이게 없으면 앱이 그냥
 * 기본 화면으로만 열려서 대시보드의 확인 모달(DashboardConfirmationModals.tsx)이 뜨지 않는다
 * — 웹/PWA는 sw.ts의 notificationclick이 clients.openWindow(url)로 이 역할을 대신한다.
 * 콜드 스타트로 앱이 알림을 통해 처음 열린 경우도 Capacitor가 리스너 등록 시점에 버퍼링된
 * 이벤트를 그대로 전달해줘서 동일하게 동작한다.
 */
export function setupPushNotificationOpenHandler(navigate: (to: string) => void): () => void {
  if (!isNative) return () => {};

  const handle = PushNotifications.addListener('pushNotificationActionPerformed', (performed) => {
    const url = (performed.notification.data as { url?: string } | undefined)?.url;
    if (!url) return;
    try {
      const parsed = new URL(url);
      navigate(parsed.pathname + parsed.search);
    } catch {
      navigate(url.startsWith('/') ? url : `/${url}`);
    }
  });

  return () => { handle.then((h) => h.remove()); };
}

/**
 * 앱 시작 시 최대한 일찍 호출해야 한다 — capacitor.config.ts의 readyTimeout(10초) 안에 이 호출이
 * 도달하지 못하면 플러그인이 "이번 번들이 문제 있다"고 판단해 자동으로 이전 번들로 롤백한다.
 * 인증 확인 등 비동기 작업을 기다리지 말고 무조건 바로 호출한다.
 */
export async function markLiveUpdateReady(): Promise<void> {
  if (!isNative) return;
  try {
    await LiveUpdate.ready();
  } catch {
    // 일부 기기/시점에 플러그인이 아직 준비 안 됐을 수 있음 — 다음 시작 때 다시 시도된다.
  }
}

interface OtaManifest {
  bundleId: string | null;
  checksum?: string;
}

/**
 * 자체 호스팅 매니페스트(workers/src/routes/app-update.ts)를 확인해 새 번들이 있으면 내려받아
 * "다음 번들"로 예약해둔다. 지금 화면을 강제로 새로고침하지 않고 다음 자연스러운 재시작(콜드
 * 스타트) 때 적용되게 둔다 — 사용 중에 화면이 갑자기 리로드되는 걸 피하기 위해서다. 네이티브
 * 코드/플러그인이 바뀐 변경은 이 경로로 못 나간다(binary-compatible한 JS/CSS/HTML만 가능) —
 * 그런 변경은 여전히 APK를 다시 빌드/배포해야 한다.
 */
export async function checkForLiveUpdate(): Promise<void> {
  if (!isNative) return;
  try {
    const res = await fetch(`${apiOrigin}/api/app-update/manifest`);
    if (!res.ok) return;
    const manifest: OtaManifest = await res.json();
    if (!manifest.bundleId) return;

    const [current, next] = await Promise.all([LiveUpdate.getCurrentBundle(), LiveUpdate.getNextBundle()]);
    if (current.bundleId === manifest.bundleId || next.bundleId === manifest.bundleId) return;

    await LiveUpdate.downloadBundle({
      bundleId: manifest.bundleId,
      url: `${apiOrigin}/api/app-update/bundle/${manifest.bundleId}`,
      checksum: manifest.checksum,
    });
    await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
  } catch (err) {
    console.error('[live-update] 확인/다운로드 실패', err);
  }
}

// 네이티브(Capacitor) 환경 감지 및 플러그인 초기화 유틸리티.
// 웹에서 import해도 no-op으로 동작하므로 조건 분기 없이 사용 가능.

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';

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

/** 네이티브 푸시 알림 권한 요청 및 토큰 등록 — 토큰 문자열 반환, 실패 시 null */
export async function registerNativePush(): Promise<string | null> {
  if (!isNative) return null;

  try {
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt') {
      status = await PushNotifications.requestPermissions();
    }
    if (status.receive !== 'granted') return null;

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
  } catch {
    return null;
  }
}

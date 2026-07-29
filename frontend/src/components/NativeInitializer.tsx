// 네이티브 앱 시작 시 1회 실행되는 초기화 컴포넌트.
// 웹 환경에서는 isNative=false라 모든 호출이 no-op.

import { useEffect, useRef } from 'react';
import {
  initNative,
  hideSplash,
  setupBackButton,
  registerNativePush,
  isNative,
  markLiveUpdateReady,
  checkForLiveUpdate,
} from '../lib/native';
import { registerNativePushToken } from '../api/push';
import { useAuth } from '../context/AuthContext';

export default function NativeInitializer() {
  const { isAuthenticated, isInitializing } = useAuth();
  const fcmTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNative) return;

    // readyTimeout(capacitor.config.ts, 10초) 안에 도달해야 하므로 다른 어떤 비동기 작업도
    // 기다리지 않고 제일 먼저 호출한다 — 늦으면 라이브 업데이트 플러그인이 방금 받은 번들을
    // "문제 있음"으로 보고 자동 롤백해버린다.
    markLiveUpdateReady();
    // 다음 실행 때 반영될 새 번들이 있는지 확인 — 실패해도 앱 동작에 영향 없다(내부에서 catch).
    checkForLiveUpdate();

    // 상태바 스타일은 로그인 확인과 무관하게 바로 적용한다. 스플래시는 로그인 확인이 끝난
    // 뒤(아래 isInitializing effect)에 내려서, 로그인 사용자가 랜딩 화면을 스치듯 보고
    // 대시보드로 넘어가는 깜빡임이 생기지 않게 한다.
    initNative();

    // Android 뒤로가기 버튼
    const cleanup = setupBackButton();

    // 토큰은 권한 허용 후 바로 받을 수 있으므로 시작 시 가져와 두고,
    // 실제 서버 등록은 인증 상태가 확정된 뒤 아래 effect에서 처리한다.
    registerNativePush().then((token) => {
      fcmTokenRef.current = token;
    });

    return cleanup;
  }, []);

  useEffect(() => {
    if (!isNative || isInitializing) return;
    hideSplash();
  }, [isInitializing]);

  // 인증 상태가 바뀔 때마다 토큰이 있으면 서버에 등록한다.
  // 앱 재시작 후 자동 로그인으로 isAuthenticated가 true가 되는 경우도 처리된다.
  useEffect(() => {
    if (!isNative || !isAuthenticated) return;

    const registerToken = async () => {
      if (!fcmTokenRef.current) {
        console.info('[FCM] 토큰 요청 중...');
        const token = await registerNativePush();
        console.info('[FCM] 토큰 결과:', token ? token.slice(0, 20) + '…' : 'null (권한 거부 또는 실패)');
        fcmTokenRef.current = token;
      }
      if (fcmTokenRef.current) {
        try {
          await registerNativePushToken(fcmTokenRef.current);
          console.info('[FCM] 서버 등록 완료');
        } catch (e) {
          console.error('[FCM] 서버 등록 실패:', e);
        }
      }
    };

    registerToken();
  }, [isAuthenticated]);

  return null;
}

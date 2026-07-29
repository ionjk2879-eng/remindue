// 네이티브 앱 시작 시 1회 실행되는 초기화 컴포넌트.
// 웹 환경에서는 isNative=false라 모든 호출이 no-op.

import { useEffect, useRef } from 'react';
import { initNative, setupBackButton, registerNativePush, isNative } from '../lib/native';
import { registerNativePushToken } from '../api/push';
import { useAuth } from '../context/AuthContext';

export default function NativeInitializer() {
  const { isAuthenticated } = useAuth();
  const fcmTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isNative) return;

    // 스플래시 숨김 + 상태바 스타일
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

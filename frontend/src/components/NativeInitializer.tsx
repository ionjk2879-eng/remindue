// 네이티브 앱 시작 시 1회 실행되는 초기화 컴포넌트.
// 웹 환경에서는 isNative=false라 모든 호출이 no-op.

import { useEffect } from 'react';
import { initNative, setupBackButton, registerNativePush, isNative } from '../lib/native';

export default function NativeInitializer() {
  useEffect(() => {
    if (!isNative) return;

    // 스플래시 숨김 + 상태바 스타일
    initNative();

    // Android 뒤로가기 버튼
    const cleanup = setupBackButton();

    // 네이티브 푸시 등록 — 토큰은 추후 서버 등록에 사용
    registerNativePush().then((token) => {
      if (token) {
        // TODO: POST /api/push/subscribe-native 로 토큰 전송 (백엔드 구현 후 활성화)
        console.info('[native] push token:', token.slice(0, 12) + '…');
      }
    });

    return cleanup;
  }, []);

  return null;
}

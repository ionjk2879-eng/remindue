import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.remindue.app',
  appName: 'Remindue',
  webDir: 'dist',
  server: {
    // https 스킴 사용 — iOS WKWebView의 일부 Web API(SubtleCrypto 등)는 secure context 필요.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: false, // App.tsx의 NativeInitializer에서 수동으로 hide (로딩 완료 후)
      backgroundColor: '#F5F5F0',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F5F5F0',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LiveUpdate: {
      // Capawesome Cloud를 쓰지 않고 자체 호스팅(Cloudflare R2 + Workers, /api/app-update/*)한다
      // — 그래서 Cloud 전용 메서드(sync()/fetchLatestBundle())는 쓰지 않고, lib/native.ts의
      // checkForLiveUpdate()가 직접 매니페스트를 확인해 downloadBundle()/setNextBundle()을
      // 호출한다. autoUpdateStrategy는 그 방식과 맞지 않아 'none'으로 둔다.
      autoUpdateStrategy: 'none',
      // 새 번들이 시작 중 크래시하는 등 markLiveUpdateReady()(ready() 호출)가 이 시간 안에
      // 도달하지 못하면 자동으로 이전(또는 기본) 번들로 롤백한다 — 반드시 설정해야 안전하다.
      readyTimeout: 10000,
    },
  },
};

export default config;

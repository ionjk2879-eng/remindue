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
      // Capawesome Live Update — 자체 호스팅 (Cloudflare R2 + Workers)
      // httpHost: 'https://api.remindue.com' ← 업데이트 서버 구축 후 활성화
      // channel: 'production'
      // appId는 capacitor.config의 appId에서 자동 읽음
    },
  },
};

export default config;

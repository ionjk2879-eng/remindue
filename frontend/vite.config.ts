import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'script',
      manifest: {
        name: 'Remindue',
        short_name: 'Remindue',
        description: '보증기간, 반품기한, 정기배송 — 흩어진 기한을 한 장의 티켓으로',
        theme_color: '#F5F5F0',
        background_color: '#F5F5F0',
        display: 'standalone',
        start_url: '/',
        lang: 'ko',
        icons: [
          // Android 알림 왼쪽의 앱 식별 아이콘. 흰 원 대신 색 시계 SVG를 공통 아이콘으로 쓴다.
          { src: '/notification-renewal.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        // png/svg는 넣지 않는다 — manifest.icons에 있는 파일들은 플러그인이 이미
        // 자동으로 프리캐시 목록에 넣어주기 때문에, 여기서 또 넣으면 같은 revision의
        // 항목이 중복 등록되어 워크박스 설치 단계에서 Cache.put()이 두 번 호출되며 깨진다
        // (InvalidAccessError: Entry already exists).
        globPatterns: ['**/*.{js,css,html}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
  },
})

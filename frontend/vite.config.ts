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
      includeAssets: [
        'notification-deadline.png',
        'notification-arrival.png',
        'notification-weekly-summary.png',
        'notification-deadline.svg',
        'notification-arrival.svg',
        'notification-weekly-summary.svg',
      ],
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
          // 브랜드 스탬프 로고(Logo.tsx와 동일한 도장 아이콘) — PWA 설치 시 홈 화면에 뜨는 아이콘.
          // notification-renewal.png(알림 전용, 시계 아이콘)와는 용도가 달라 따로 둔다.
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        // SVG는 includeAssets와 manifest.icons에서 별도로 프리캐시한다. 여기에도 넣으면
        // 같은 revision의 항목이 중복 등록되어 워크박스 설치 단계에서 깨질 수 있다.
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

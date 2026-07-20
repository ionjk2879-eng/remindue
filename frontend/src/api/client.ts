import axios from 'axios';

// wrangler dev 기본 포트(8787)의 Cloudflare Workers 백엔드를 바라본다(로컬 dev, 즉 `vite`로 실행할 때).
// 빌드 시점에 VITE_API_BASE_URL로 재정의된다 — `.env.production`은 운영 백엔드,
// `.env.dev`는 dev 브랜치 고정 프리뷰 백엔드(dev-remindue...)를 가리킨다. Vite가
// `--mode <mode>`에 맞는 `.env.<mode>` 파일을 자동으로 골라 쓴다.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';

export const apiClient = axios.create({
  baseURL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('nickname');
      localStorage.removeItem('isPremium');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

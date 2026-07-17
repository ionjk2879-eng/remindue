import axios from 'axios';

// wrangler dev 기본 포트(8787)의 Cloudflare Workers 백엔드를 바라본다.
// 배포 환경에서는 VITE_API_BASE_URL로 재정의한다 (예: https://remindue-workers.<subdomain>.workers.dev/api).
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
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

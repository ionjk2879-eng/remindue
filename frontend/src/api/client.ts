import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from '../types';
import { isNative } from '../lib/native';
import { loadNativeRefreshToken, saveNativeRefreshToken } from '../lib/native-auth';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';
/** 백엔드 워커 출처(끝의 /api 제외) — R2에서 직접 서빙하는 다운로드 링크(APK 등) 조립에 쓴다. */
export const apiOrigin = baseURL.replace(/\/api\/?$/, '');
let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const apiClient = axios.create({ baseURL, withCredentials: true });

export async function refreshSession(): Promise<AuthResponse> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      if (isNative) {
        // 네이티브: preferences에 저장된 리프레시 토큰을 바디로 전달
        const storedToken = await loadNativeRefreshToken();
        if (!storedToken) throw new Error('저장된 세션이 없습니다');
        const { data } = await axios.post<AuthResponse>(
          `${baseURL}/auth/refresh`,
          { refreshToken: storedToken, native: true },
          { withCredentials: true }
        );
        setAccessToken(data.accessToken);
        if (data.refreshToken) await saveNativeRefreshToken(data.refreshToken);
        return data;
      }
      // 웹: 쿠키 기반
      const { data } = await axios.post<AuthResponse>(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      setAccessToken(data.accessToken);
      return data;
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

interface RetryableRequest extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryableRequest | undefined;
    const isAuthEndpoint = request?.url?.includes('/auth/login')
      || request?.url?.includes('/auth/signup')
      || request?.url?.includes('/auth/refresh');
    if (error.response?.status !== 401 || !request || request._authRetry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    request._authRetry = true;
    try {
      const session = await refreshSession();
      request.headers.Authorization = `Bearer ${session.accessToken}`;
      return apiClient(request);
    } catch {
      setAccessToken(null);
      window.dispatchEvent(new Event('remindue:session-expired'));
      return Promise.reject(error);
    }
  }
);

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from '../types';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';
let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export const apiClient = axios.create({ baseURL, withCredentials: true });

export async function refreshSession(): Promise<AuthResponse> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<AuthResponse>(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .finally(() => { refreshPromise = null; });
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

import { apiClient, setAccessToken } from './client';
import type { AuthResponse } from '../types';

export async function signup(email: string, password: string, nickname: string) {
  const { data } = await apiClient.post<AuthResponse>('/auth/signup', { email, password, nickname });
  setAccessToken(data.accessToken);
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password });
  setAccessToken(data.accessToken);
  return data;
}

export async function deleteAccount(password: string) {
  await apiClient.delete('/auth/account', { data: { password } });
  setAccessToken(null);
}

export async function logoutSession() {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // 네트워크가 끊겨도 메모리의 access token은 반드시 폐기한다.
  } finally {
    setAccessToken(null);
  }
}

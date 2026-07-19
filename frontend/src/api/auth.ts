import { apiClient } from './client';
import type { AuthResponse } from '../types';

export async function signup(email: string, password: string, nickname: string) {
  const { data } = await apiClient.post<AuthResponse>('/auth/signup', { email, password, nickname });
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function deleteAccount(password: string) {
  await apiClient.delete('/auth/account', { data: { password } });
}

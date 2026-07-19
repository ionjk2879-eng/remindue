import { apiClient } from './client';

export interface NotificationDaysResponse {
  notificationDays: number[];
  savedNotificationDays: number[];
  isPremium: boolean;
}

export async function fetchNotificationDays() {
  const { data } = await apiClient.get<NotificationDaysResponse>('/settings/notification-days');
  return data;
}

export async function updateNotificationDays(days: number[]) {
  const { data } = await apiClient.put<{ notificationDays: number[]; isPremium: boolean }>('/settings/notification-days', {
    notificationDays: days,
  });
  return data;
}

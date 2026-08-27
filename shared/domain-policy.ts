export const PURCHASE_TYPES = ['GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION'] as const;
export type SharedPurchaseType = (typeof PURCHASE_TYPES)[number];

/** 사용자가 알림 시점을 직접 설정하지 않았을 때(또는 저장값이 손상됐을 때) 쓰는 기본값. */
export const DEFAULT_NOTIFICATION_DAYS = [7, 3, 0] as const;
export const NOTIFICATION_DAY_OPTIONS = [10, 7, 5, 3, 2, 1, 0] as const;

export function isRecurringType(type: SharedPurchaseType): boolean {
  return type === 'RECURRING_DELIVERY' || type === 'SUBSCRIPTION';
}

export interface PastItemInput {
  type: SharedPurchaseType;
  dDay: number;
  isOneTime: boolean;
  discontinuedAt: string | null;
  /** "내 목록"에서 수동으로 삭제한 항목 — null이 아니면 "지난 항목" 탭으로 분류한다. */
  discardedAt?: string | null;
}

export function isPastItem(item: PastItemInput): boolean {
  return (!isRecurringType(item.type) && item.dDay < 0)
    || (isRecurringType(item.type) && item.discontinuedAt !== null)
    || (item.discardedAt != null);
}

export function formatNotificationDays(days: readonly number[]): string {
  return days.join('/');
}

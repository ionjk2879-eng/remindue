export const PURCHASE_TYPES = ['GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION'] as const;
export type SharedPurchaseType = (typeof PURCHASE_TYPES)[number];

export const FREE_PLAN_MAX_PURCHASES = 5;
export const FREE_NOTIFICATION_DAYS = [7, 3, 0] as const;
export const NOTIFICATION_DAY_OPTIONS = [10, 7, 5, 3, 2, 1, 0] as const;

export const PLAN_FEATURES = {
  free: {
    maxPurchases: FREE_PLAN_MAX_PURCHASES,
    notificationDays: FREE_NOTIFICATION_DAYS,
    weeklySummary: false,
    customNotificationDays: false,
    export: false,
    familySharing: false,
  },
  premium: {
    maxPurchases: null,
    notificationDays: null,
    weeklySummary: true,
    customNotificationDays: true,
    export: true,
    familySharing: true,
  },
} as const;

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

export const PUBLIC_DOMAIN_CONFIG = {
  purchaseTypes: PURCHASE_TYPES,
  plans: PLAN_FEATURES,
} as const;

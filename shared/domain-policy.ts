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
  /** 정기배송/구독 전용 — 마지막 회차가 결제일로부터 1주일까지도 미확인 상태로 남아있으면
   *  true(서버가 계산해 내려준다 — 날짜 계산 로직 중복을 피하려고 프론트에서 다시 계산하지
   *  않는다). "유지 안 함"을 명시로 누른 게 아니므로 discontinuedAt과는 별개 신호다. */
  pastDueUnconfirmed?: boolean;
}

export function isPastItem(item: PastItemInput): boolean {
  return (!isRecurringType(item.type) && item.dDay < 0)
    || (isRecurringType(item.type) && item.discontinuedAt !== null)
    || (isRecurringType(item.type) && item.isOneTime && item.dDay < 0)
    || (isRecurringType(item.type) && item.pastDueUnconfirmed === true)
    || (item.discardedAt != null);
}

export function formatNotificationDays(days: readonly number[]): string {
  return days.join('/');
}

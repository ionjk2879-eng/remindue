import type { PendingPurchase, Purchase, PurchaseCategory, PurchaseType } from '../../types';
import { isRecurringType } from '../../types';
import { formatShortDate, todayDateOnly } from '../../components/dashboard/dashboardUtils';

export const PURCHASES_PAGE_SIZE = 5;
export const FOREIGN_CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'CAD', 'AUD'] as const;
export const URGENT_WINDOW_DAYS = 7;
export const MISSED_ROUNDS_REVIEW_THRESHOLD = 3;

export function formatAmountInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}

export function parseAmountInput(value: string): number | undefined {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

export const TYPE_LABEL: Record<PurchaseType, string> = {
  GENERAL: '일반 구매', RECURRING_DELIVERY: '정기배송', SUBSCRIPTION: '정기구독',
};
export const DEADLINE_LABEL: Record<PurchaseType, string> = {
  GENERAL: '기한', RECURRING_DELIVERY: '다음 일정', SUBSCRIPTION: '다음 일정',
};
export const TYPE_SHORT_LABEL: Record<PurchaseType, string> = {
  GENERAL: '일반구매', RECURRING_DELIVERY: '정기배송', SUBSCRIPTION: '정기구독',
};
export const PURCHASE_TYPES: PurchaseType[] = ['GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION'];
export const PURCHASE_CATEGORIES: PurchaseCategory[] = [
  'SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY', 'SKINCARE',
  'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER',
];
export const CATEGORY_LABEL: Record<PurchaseCategory, string> = {
  SOFTWARE: '소프트웨어', AI: 'AI', ENTERTAINMENT: '엔터테인먼트', SHOPPING: '쇼핑', FOOD: '식품',
  HAIR_BODY: '헤어/바디', SKINCARE: '스킨케어', PET: '반려동물', ELECTRONICS: '전자제품',
  CREATOR_SUPPORT: '크리에이터 후원', CLOUD: '클라우드', OTHER: '기타',
};
export const CATEGORY_ICON: Record<PurchaseCategory, string> = {
  SOFTWARE: '💻', AI: '🤖', ENTERTAINMENT: '🎬', SHOPPING: '🛒', FOOD: '🍽️', HAIR_BODY: '🧴',
  SKINCARE: '✨', PET: '🐾', ELECTRONICS: '🔌', CREATOR_SUPPORT: '💝', CLOUD: '☁️', OTHER: '📦',
};

export type FilterType = 'ALL' | PurchaseType;
export const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'ALL', label: '전체' }, { key: 'GENERAL', label: '일반구매' },
  { key: 'RECURRING_DELIVERY', label: '정기배송' }, { key: 'SUBSCRIPTION', label: '정기구독' },
];

export function isFullyConfirmed(purchase: Purchase): boolean {
  return isRecurringType(purchase.type) && purchase.lastDeliveredDate === todayDateOnly();
}

export function renderGeneralDeadlineLines(purchase: Purchase) {
  return <>
    {purchase.returnDeadlineDate && <p className="ticket-card__deadline">반품기한 · <span className="mono">{purchase.returnDeadlineDate}</span></p>}
    {purchase.warrantyDeadlineDate && <p className="ticket-card__deadline">A/S 보증만료 · <span className="mono">{purchase.warrantyDeadlineDate}</span></p>}
  </>;
}

export function renderRecurringScheduleLine(purchase: Purchase) {
  if (purchase.discontinuedAt !== null || purchase.isOneTime) {
    return <p className="ticket-card__deadline">다음 일정: <span className="ticket-card__deadline-discontinued">유지 안 함</span></p>;
  }
  const schedule = purchase.scheduleType === 'FIXED_DAY' && purchase.fixedDayOfMonth !== null
    ? `${purchase.fixedDayIntervalMonths > 1 ? `${purchase.fixedDayIntervalMonths}달마다` : '매월'} ${purchase.fixedDayOfMonth}일`
    : null;
  return <p className="ticket-card__deadline">
    다음 일정: <span className="mono">{purchase.deliveryRound}회차</span>{schedule && ` · ${schedule}`}{' ('}<span className="mono">{formatShortDate(purchase.deadline)}</span>{')'}
    {purchase.arrivalRangeEstimate && <> · 도착 예상 <span className="mono">{formatShortDate(purchase.arrivalRangeEstimate.from)}~{formatShortDate(purchase.arrivalRangeEstimate.to)}</span></>}
  </p>;
}

export function primaryDeadlineLabel(purchase: Purchase): string {
  if (isRecurringType(purchase.type)) return '다음 일정';
  if (purchase.deadline === purchase.warrantyDeadlineDate && purchase.deadline !== purchase.returnDeadlineDate) return 'A/S 보증만료';
  return '반품기한';
}

export function renderAmountChangeArrow(purchase: Purchase, pendingByPurchaseId: Map<number, PendingPurchase>) {
  const pending = pendingByPurchaseId.get(purchase.id);
  const previous = pending ? pending.previousAmount! : purchase.priceChangePreviousAmount;
  const current = pending ? pending.amount! : purchase.amount;
  if (previous === null || current === null) return null;
  const increase = current > previous;
  return <span className={`amount-change-arrow amount-change-arrow--${increase ? 'up' : 'down'}`} role="img" aria-label={increase ? '가격 인상 감지' : '가격 인하 감지'} title={increase ? '가격 인상 감지' : '가격 인하 감지'}>{increase ? '↗' : '↘'}</span>;
}

export function renderCategoryBadge(purchase: Purchase) {
  const tags = purchase.categoryTags.length ? purchase.categoryTags : purchase.category ? [purchase.category] : [];
  return tags.map((category) => <span className={`ticket-card__category ticket-card__category--${category}`} key={category}>{CATEGORY_ICON[category]} {CATEGORY_LABEL[category]}</span>);
}

export function groupByCategory(items: Purchase[]): { category: PurchaseCategory | 'UNCATEGORIZED'; items: Purchase[] }[] {
  const groups = PURCHASE_CATEGORIES.map((category) => ({ category: category as PurchaseCategory | 'UNCATEGORIZED', items: items.filter((item) => item.category === category).sort((a, b) => a.dDay - b.dDay) })).filter((group) => group.items.length);
  const uncategorized = items.filter((item) => item.category === null).sort((a, b) => a.dDay - b.dDay);
  if (uncategorized.length) groups.push({ category: 'UNCATEGORIZED', items: uncategorized });
  return groups;
}

export function missedRoundsFor(purchase: Purchase): number {
  if (!isRecurringType(purchase.type) || purchase.deliveryRound === null) return 0;
  const confirmable = purchase.paymentDDay <= 0 ? purchase.deliveryRound : purchase.deliveryRound - 1;
  return Math.max(0, confirmable - purchase.deliveryConfirmCount);
}

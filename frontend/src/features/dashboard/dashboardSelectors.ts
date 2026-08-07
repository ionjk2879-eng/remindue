import { isPastItem } from '../../../../shared/domain-policy';
import type { PendingPurchase, Purchase, PurchaseCategory } from '../../types';
import { isRecurringType } from '../../types';
import {
  MISSED_ROUNDS_REVIEW_THRESHOLD,
  PURCHASE_CATEGORIES,
  PURCHASES_PAGE_SIZE,
  missedRoundsFor,
  type FilterType,
} from './dashboardModel';

export type CategoryFilter = 'ALL' | 'UNCATEGORIZED' | PurchaseCategory;

export function selectPurchaseList(
  purchases: Purchase[],
  filterType: FilterType,
  filterCategory: CategoryFilter,
  page: number,
) {
  // "지난 항목" 탭은 최신순(방금 삭제/유지 안 함 처리한 항목이 맨 위)으로 보여준다 — updatedAt은
  // 삭제·유지 안 함·복원 등 어떤 액션이든 갱신되므로, 왜 지난 항목이 됐는지와 무관하게 쓸 수 있다.
  const overdueItems = purchases.filter(isPastItem).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeItems = purchases.filter((purchase) => !isPastItem(purchase));
  const categoryFilterOptions: ('UNCATEGORIZED' | PurchaseCategory)[] = [
    ...PURCHASE_CATEGORIES.filter((category) =>
      activeItems.some((purchase) => (filterType === 'ALL' || purchase.type === filterType) && purchase.category === category),
    ),
    ...(activeItems.some((purchase) => (filterType === 'ALL' || purchase.type === filterType) && purchase.category === null)
      ? (['UNCATEGORIZED'] as const)
      : []),
  ];
  const displayedPurchases = activeItems.filter((purchase) => {
    if (filterType !== 'ALL' && purchase.type !== filterType) return false;
    if (filterCategory === 'ALL') return true;
    if (filterCategory === 'UNCATEGORIZED') return purchase.category === null;
    return purchase.category === filterCategory;
  });
  const totalPages = Math.max(1, Math.ceil(displayedPurchases.length / PURCHASES_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedPurchases = displayedPurchases.slice(
    (safePage - 1) * PURCHASES_PAGE_SIZE,
    safePage * PURCHASES_PAGE_SIZE,
  );
  return { overdueItems, activeItems, categoryFilterOptions, displayedPurchases, totalPages, safePage, pagedPurchases };
}

export function selectPurchaseSignals(allPurchases: Purchase[], pendingItems: PendingPurchase[]) {
  // "삭제"(discard)된 항목은 지난 항목 탭으로 옮겨간 것이니 절약 제안/가격 변동 감지 같은
  // "지금 챙길 것" 신호에는 다시 나타나면 안 된다 — selectWeeklyDashboard와 동일한 이유로 걸러낸다.
  const purchases = allPurchases.filter((purchase) => purchase.discardedAt === null);
  const reviewCandidates = purchases
    .filter((purchase) =>
      isRecurringType(purchase.type)
      && !purchase.isOneTime
      && purchase.amount !== null
      && (purchase.discontinuedAt !== null || missedRoundsFor(purchase) >= MISSED_ROUNDS_REVIEW_THRESHOLD),
    )
    .map((purchase) => ({
      id: purchase.id,
      itemName: purchase.itemName,
      type: purchase.type,
      monthly: Math.round(
        purchase.scheduleType === 'FIXED_DAY'
          ? purchase.amount!
          : (purchase.amount! * 30) / (purchase.intervalDays || 30),
      ),
      isExplicit: purchase.discontinuedAt !== null,
      missedRounds: missedRoundsFor(purchase),
    }));
  const needsConfirmationItems = purchases.filter((purchase) =>
    isRecurringType(purchase.type)
    && !purchase.isOneTime
    && purchase.discontinuedAt === null
    && missedRoundsFor(purchase) >= 1,
  );
  const pendingPriceChangeByPurchaseId = new Map(
    pendingItems
      .filter((item) => item.matchedPurchaseId !== null && item.previousAmount !== null && item.amount !== null)
      .map((item) => [item.matchedPurchaseId!, item]),
  );
  const priceChangePurchaseIds = new Set([
    ...pendingPriceChangeByPurchaseId.keys(),
    ...purchases
      .filter((purchase) =>
        purchase.priceChangePreviousAmount !== null
        && purchase.amount !== null
        && purchase.priceChangePreviousAmount !== purchase.amount,
      )
      .map(({ id }) => id),
  ]);
  const reviewIds = new Set(reviewCandidates.map(({ id }) => id));
  const recurringPurchases = purchases.filter((purchase) => isRecurringType(purchase.type));
  return {
    reviewCandidates,
    savingsEstimate: reviewCandidates.reduce((sum, item) => sum + item.monthly, 0),
    needsConfirmationItems,
    pendingPriceChangeByPurchaseId,
    priceChangeCount: priceChangePurchaseIds.size,
    priceUpItems: recurringPurchases.filter(({ id }) => priceChangePurchaseIds.has(id)),
    unusedItems: recurringPurchases.filter(({ id }) => !priceChangePurchaseIds.has(id) && reviewIds.has(id)),
    normalItems: recurringPurchases.filter(({ id }) => !priceChangePurchaseIds.has(id) && !reviewIds.has(id)),
  };
}

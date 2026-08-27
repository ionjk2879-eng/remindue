import type { Purchase, PurchaseCategory } from '../../types';
import { isRecurringType } from '../../types';
import { PURCHASE_CATEGORIES } from './dashboardModel';
import { occurrenceAmount, occurrenceDatesInMonth, occurrencesInMonth, totalSpendInMonth } from '../../components/dashboard/dashboardUtils';

export interface SpendingOccurrence {
  key: string;
  itemName: string;
  type: Purchase['type'];
  date: string;
  amount: number;
}

export interface SpendingDateGroup {
  date: string;
  items: SpendingOccurrence[];
  total: number;
}

export function computeSpendingByDate(purchases: Purchase[], year: number, month: number) {
  const occurrences = purchases.flatMap<SpendingOccurrence>((purchase) => {
    if (purchase.amount === null) return [];
    if (isRecurringType(purchase.type)) {
      return occurrenceDatesInMonth(purchase, year, month).map((date, index) => ({
        key: `${purchase.id}-${index}`,
        itemName: purchase.itemName,
        type: purchase.type,
        date,
        amount: occurrenceAmount(purchase, date) ?? purchase.amount!,
      }));
    }
    const [baseYear, baseMonth] = purchase.baseDate.split('-').map(Number);
    return baseYear === year && baseMonth === month
      ? [{ key: String(purchase.id), itemName: purchase.itemName, type: purchase.type, date: purchase.baseDate, amount: purchase.amount }]
      : [];
  });

  const grouped = occurrences.reduce<Record<string, SpendingDateGroup>>((result, occurrence) => {
    const group = result[occurrence.date] ?? { date: occurrence.date, items: [], total: 0 };
    group.items.push(occurrence);
    group.total += occurrence.amount;
    result[occurrence.date] = group;
    return result;
  }, {});

  return {
    byDate: Object.values(grouped).sort((left, right) => left.date.localeCompare(right.date)),
    total: occurrences.reduce((sum, occurrence) => sum + occurrence.amount, 0),
  };
}

export function calculateYearlySpending(purchases: Purchase[], year: number, currentMonth: number) {
  const monthlyTotals = Array.from({ length: 12 }, (_, index) => totalSpendInMonth(purchases, year, index + 1));
  const monthlyDetails = monthlyTotals.map((total, index) => {
    const month = index + 1;
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;
    const previousTotal = totalSpendInMonth(purchases, previousYear, previousMonth);
    const percentage = previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null;
    return {
      month,
      total,
      trend: (total > previousTotal ? 'up' : total < previousTotal ? 'down' : 'flat') as 'up' | 'down' | 'flat',
      percentLabel: percentage !== null ? `${percentage > 0 ? '+' : ''}${percentage}%` : total > 0 ? '신규' : '0%',
      isFuture: month > currentMonth,
    };
  });
  return { monthlyTotals, monthlyDetails, yearlyTotal: monthlyTotals.reduce((sum, total) => sum + total, 0) };
}

export function calculateCategorySpending(purchases: Purchase[], year: number, month: number) {
  const categoryCounts = PURCHASE_CATEGORIES.map((category) => {
    const items = purchases.filter((purchase) => purchase.category === category && purchase.amount !== null);
    const count = items.filter((purchase) => {
      if (isRecurringType(purchase.type)) return occurrencesInMonth(purchase, year, month) > 0;
      const [baseYear, baseMonth] = purchase.baseDate.split('-').map(Number);
      return baseYear === year && baseMonth === month;
    }).length;
    return { category, count, amount: totalSpendInMonth(items, year, month) };
  }).filter(({ count, amount }) => count > 0 || amount > 0);

  const uncategorizedCount = purchases.filter((purchase) => {
    if (purchase.category !== null || purchase.amount === null) return false;
    if (isRecurringType(purchase.type)) return occurrencesInMonth(purchase, year, month) > 0;
    const [baseYear, baseMonth] = purchase.baseDate.split('-').map(Number);
    return baseYear === year && baseMonth === month;
  }).length;

  return { categoryCounts, uncategorizedCount };
}

export function calculateCategoryItems(purchases: Purchase[], category: PurchaseCategory, year: number, month: number) {
  return purchases
    .filter((purchase) => purchase.category === category && purchase.amount !== null)
    .map((purchase) => {
      const amount = isRecurringType(purchase.type)
        ? occurrencesInMonth(purchase, year, month) * purchase.amount!
        : (() => {
            const [baseYear, baseMonth] = purchase.baseDate.split('-').map(Number);
            return baseYear === year && baseMonth === month ? purchase.amount! : 0;
          })();
      return { id: purchase.id, itemName: purchase.itemName, type: purchase.type, amount };
    })
    .filter(({ amount }) => amount > 0);
}

export function calculateSelectedSpend(purchases: Purchase[], selectedIds: number[], year: number, month: number) {
  return Math.round(purchases.filter(({ id }) => selectedIds.includes(id)).reduce((sum, purchase) => {
    if (purchase.amount === null) return sum;
    if (isRecurringType(purchase.type)) {
      return sum + occurrenceDatesInMonth(purchase, year, month).reduce(
        (purchaseTotal, date) => purchaseTotal + (occurrenceAmount(purchase, date) ?? 0),
        0,
      );
    }
    const [baseYear, baseMonth] = purchase.baseDate.split('-').map(Number);
    return sum + (baseYear === year && baseMonth === month ? purchase.amount : 0);
  }, 0));
}

/** 특정 지출 계산기에는 선택한 달에 실제 지출이 있는 기록만 보여준다. "삭제"(discardedAt)는
 *  목록에서만 뺀 거고 실제 지출은 그대로 집계 대상이라(CLAUDE.md 계정 삭제/discard 정책 참고),
 *  다른 지출 합계(월별/연간/카테고리)와 마찬가지로 여기서도 걸러내지 않는다. */
export function selectCalculatorPurchases(purchases: Purchase[], year: number, month: number) {
  return purchases.filter((purchase) =>
    purchase.amount !== null
    && totalSpendInMonth([purchase], year, month) > 0
  );
}

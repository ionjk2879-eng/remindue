import type { Purchase } from '../../types';
import { isRecurringType } from '../../types';
import {
  currentCalendarWeekRange,
  isWithinRecentDays,
  isWithinUpcomingDays,
  occurrenceDatesInMonth,
  previousFixedScheduleDate,
  shiftDateOnly,
  todayDateOnly,
} from '../../components/dashboard/dashboardUtils';
import { URGENT_WINDOW_DAYS, isFullyConfirmed, missedRoundsFor } from './dashboardModel';

export interface WeeklyEntry {
  purchase: Purchase;
  completed: boolean;
  completedAt: string | null;
}

export function needsAttentionBadge(purchase: Purchase) {
  return purchase.type !== 'GENERAL'
    && !purchase.isOneTime
    && purchase.discontinuedAt === null
    && missedRoundsFor(purchase) >= 1;
}

export function selectWeeklyDashboard(purchases: Purchase[], today = todayDateOnly()) {
  const urgent = purchases
    .filter((purchase) => isRecurringType(purchase.type)
      ? purchase.paymentDDay === 0
      : purchase.dDay >= 0 && purchase.dDay <= URGENT_WINDOW_DAYS)
    .sort((left, right) => left.dDay - right.dDay);
  const weeklyRecurring = purchases
    .filter((purchase) =>
      isRecurringType(purchase.type)
      && purchase.discontinuedAt === null
      && purchase.paymentDDay >= 0
      && purchase.paymentDDay <= URGENT_WINDOW_DAYS,
    )
    .sort((left, right) => left.paymentDDay - right.paymentDDay);
  const weeklyDeliveries = purchases
    .filter((purchase) => {
      if (purchase.discontinuedAt !== null) return false;
      if (purchase.type === 'GENERAL') {
        return purchase.expectedDeliveryDate !== null
          && isWithinUpcomingDays(purchase.expectedDeliveryDate, URGENT_WINDOW_DAYS);
      }
      return purchase.type === 'RECURRING_DELIVERY'
        && purchase.arrivalRangeEstimate !== null
        && isWithinUpcomingDays(purchase.arrivalRangeEstimate.from, URGENT_WINDOW_DAYS);
    })
    .sort((left, right) => {
      const leftDate = left.type === 'RECURRING_DELIVERY' ? left.arrivalRangeEstimate!.from : left.expectedDeliveryDate!;
      const rightDate = right.type === 'RECURRING_DELIVERY' ? right.arrivalRangeEstimate!.from : right.expectedDeliveryDate!;
      return leftDate.localeCompare(rightDate);
    });
  const calendarWeek = currentCalendarWeekRange(today);
  const weeklyPaymentCount = purchases
    .filter((purchase) => purchase.type === 'SUBSCRIPTION' && purchase.discontinuedAt === null)
    .reduce((count, purchase) => {
      const startYear = Number(calendarWeek.start.slice(0, 4));
      const startMonth = Number(calendarWeek.start.slice(5, 7));
      const endYear = Number(calendarWeek.end.slice(0, 4));
      const endMonth = Number(calendarWeek.end.slice(5, 7));
      const dates = [
        ...occurrenceDatesInMonth(purchase, startYear, startMonth),
        ...(startYear === endYear && startMonth === endMonth
          ? []
          : occurrenceDatesInMonth(purchase, endYear, endMonth)),
      ];
      return count + dates.filter((date) => date >= calendarWeek.start && date <= today).length;
    }, 0);
  const completedThisWeek = (purchase: Purchase) =>
    purchase.lastDeliveredDate !== null
    && isWithinRecentDays(purchase.lastDeliveredDate, URGENT_WINDOW_DAYS);
  const discontinuedThisWeek = (purchase: Purchase) =>
    purchase.discontinuedAt !== null
    && isWithinRecentDays(purchase.discontinuedAt.slice(0, 10), URGENT_WINDOW_DAYS);
  const previousSchedule = (purchase: Purchase) => purchase.scheduleType === 'FIXED_DAY'
    ? previousFixedScheduleDate(purchase.deadline, purchase.fixedDayOfMonth ?? 1, purchase.fixedDayIntervalMonths)
    : shiftDateOnly(purchase.deadline, -(purchase.intervalDays ?? 30));
  const discontinuedScheduledThisWeek = (purchase: Purchase) =>
    purchase.discontinuedAt !== null
    && isWithinRecentDays(previousSchedule(purchase), URGENT_WINDOW_DAYS);

  const weeklyDeliveryEntries: WeeklyEntry[] = [
    ...weeklyDeliveries.map((purchase) => ({
      purchase,
      completed: completedThisWeek(purchase),
      completedAt: purchase.lastDeliveredDate,
    })),
    ...purchases
      .filter((purchase) =>
        purchase.type === 'GENERAL'
        && completedThisWeek(purchase)
        && !weeklyDeliveries.some(({ id }) => id === purchase.id),
      )
      .map((purchase) => ({ purchase, completed: true, completedAt: purchase.lastDeliveredDate })),
  ];
  const weeklySubscriptionEntries: WeeklyEntry[] = [
    ...weeklyRecurring.map((purchase) => ({
      purchase,
      completed: purchase.isOneTime || purchase.discontinuedAt !== null || completedThisWeek(purchase),
      completedAt: purchase.lastDeliveredDate,
    })),
    ...purchases
      .filter((purchase) =>
        purchase.type === 'SUBSCRIPTION'
        && completedThisWeek(purchase)
        && !weeklyRecurring.some(({ id }) => id === purchase.id),
      )
      .map((purchase) => ({ purchase, completed: true, completedAt: purchase.lastDeliveredDate })),
    ...purchases
      .filter((purchase) =>
        purchase.type === 'SUBSCRIPTION'
        && (discontinuedThisWeek(purchase) || discontinuedScheduledThisWeek(purchase))
        && !completedThisWeek(purchase)
        && !weeklyRecurring.some(({ id }) => id === purchase.id),
      )
      .map((purchase) => ({
        purchase,
        completed: true,
        completedAt: discontinuedScheduledThisWeek(purchase)
          ? previousSchedule(purchase)
          : purchase.discontinuedAt!.slice(0, 10),
      })),
  ];
  const arrivalChecks = purchases.filter((purchase) => {
    if (purchase.type !== 'GENERAL') return false;
    if (purchase.arrivalCheckSnoozedUntil !== null) return true;
    return purchase.lastDeliveredDate === null && purchase.expectedDeliveryDate === today;
  });

  return {
    today,
    urgent,
    urgentAllHandled: urgent.length > 0 && urgent.every(isFullyConfirmed),
    weeklyDeliveries,
    weeklySubscriptions: weeklyRecurring,
    weeklyPaymentCount,
    weeklyDeliveryEntries,
    weeklySubscriptionEntries,
    arrivalChecks,
    arrivalSnoozedCount: arrivalChecks.filter(({ arrivalCheckSnoozedUntil }) => arrivalCheckSnoozedUntil !== null).length,
  };
}

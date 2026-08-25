import type { Dispatch, SetStateAction } from 'react';
import {
  archivePurchase,
  confirmAllDelivered,
  deletePurchase,
  disableDeadlineNotifications,
  discardAllPurchases,
  discardPurchase,
  discontinuePurchase,
  markDelivered,
  resumePurchase,
  unarchivePurchase,
  undiscardPurchase,
} from '../../api/purchases';
import type { Purchase } from '../../types';
import { daysSinceBaseDate } from '../../components/dashboard/dashboardUtils';

interface Options {
  overdueItems: Purchase[];
  needsConfirmationItems: Purchase[];
  load: () => Promise<void>;
  loadSpendHistory: () => Promise<void>;
  loadArchived: () => Promise<void>;
  setConfirmedRecurringIds: Dispatch<SetStateAction<number[]>>;
  setConfirmAllMessage: Dispatch<SetStateAction<string | null>>;
}

export function usePurchaseMutations({
  overdueItems,
  needsConfirmationItems,
  load,
  loadSpendHistory,
  loadArchived,
  setConfirmedRecurringIds,
  setConfirmAllMessage,
}: Options) {
  const handleDelete = async (id: number) => {
    if (!window.confirm('취소하면 이 항목의 지출 기록도 완전히 사라져요. 계속할까요?')) return;
    await deletePurchase(id);
    await Promise.all([load(), loadSpendHistory()]);
  };
  const handleDiscard = async (id: number) => {
    if (!window.confirm('지난 항목으로 이동해요. 이미 발생한 지출은 통계에 그대로 남아요. 계속할까요?')) return;
    await discardPurchase(id);
    await Promise.all([load(), loadSpendHistory()]);
  };
  const handleDiscardAll = async () => {
    // 이미 삭제(discard)된 항목은 "지난 항목"에 이미 있으니 제외 — 자연 만료된 항목만 대상.
    const targets = overdueItems.filter((p) => p.discardedAt === null);
    if (targets.length === 0) return;
    if (!window.confirm(`지난 항목 ${targets.length}건을 한 번에 삭제할까요? 이미 발생한 지출은 통계에 그대로 남아요.`)) return;
    await discardAllPurchases(targets.map(({ id }) => id));
    await Promise.all([load(), loadSpendHistory()]);
  };
  const handleUndiscard = async (id: number) => {
    await undiscardPurchase(id);
    await load();
  };
  const handleMarkDelivered = async (id: number) => {
    await markDelivered(id);
    await load();
  };
  const handleRecurringSelectionConfirm = async (id: number) => {
    await handleMarkDelivered(id);
    setConfirmedRecurringIds((ids) => [...ids, id]);
  };
  const handleDiscontinue = async (id: number) => {
    await discontinuePurchase(id);
    await Promise.all([load(), loadSpendHistory()]);
  };
  const handleResume = async (id: number) => {
    await resumePurchase(id);
    await Promise.all([load(), loadSpendHistory()]);
  };
  const handleDisableDeadlineNotifications = async (id: number) => {
    await disableDeadlineNotifications(id);
    await load();
  };
  const handleConfirmAll = async () => {
    if (needsConfirmationItems.length === 0) return;
    await confirmAllDelivered(needsConfirmationItems.map(({ id }) => id));
    const detail = needsConfirmationItems.map((purchase) => {
      const months = Math.max(1, Math.round(daysSinceBaseDate(purchase.baseDate) / 30));
      const kind = purchase.type === 'RECURRING_DELIVERY' ? '정기배송 신청' : '구독';
      return `${purchase.itemName} ${months}개월째 ${kind} 중`;
    }).join(' · ');
    setConfirmAllMessage(`이번 달도 ${needsConfirmationItems.length}개 항목을 이용 중으로 표시했습니다. (${detail})`);
    window.setTimeout(() => setConfirmAllMessage(null), 8000);
    await load();
  };
  const handleArchive = async (id: number) => {
    await archivePurchase(id);
    await Promise.all([load(), loadSpendHistory()]);
  };
  const handleUnarchive = async (id: number) => {
    await unarchivePurchase(id);
    await Promise.all([loadArchived(), load(), loadSpendHistory()]);
  };
  return {
    handleDelete,
    handleDiscard,
    handleDiscardAll,
    handleUndiscard,
    handleMarkDelivered,
    handleRecurringSelectionConfirm,
    handleDiscontinue,
    handleResume,
    handleDisableDeadlineNotifications,
    handleConfirmAll,
    handleArchive,
    handleUnarchive,
  };
}

import { useCallback, useEffect, useState } from 'react';
import {
  fetchPurchases,
  fetchPurchasesForSpendHistory,
} from '../../api/purchases';
import { fetchReceivedInvites } from '../../api/sharing';
import type { Purchase, SharedAccess } from '../../types';

export function useDashboardPurchases(nickname: string | null) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [spendHistoryPurchases, setSpendHistoryPurchases] = useState<Purchase[]>([]);
  const [archivedPurchases, setArchivedPurchases] = useState<Purchase[]>([]);
  const [acceptedShares, setAcceptedShares] = useState<SharedAccess[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const cacheKey = `purchases_cache_${nickname ?? 'anon'}`;

  const load = useCallback(async () => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setPurchases(JSON.parse(cached) as Purchase[]);
        setPurchasesLoaded(true);
      }
    } catch {
      // A corrupt or unavailable cache must never prevent the server refresh.
    }

    const data = await fetchPurchases();
    setPurchases(data);
    setPurchasesLoaded(true);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      // Storage can be unavailable in private browsing or when the quota is full.
    }
  }, [cacheKey]);

  const loadSpendHistory = useCallback(async () => {
    setSpendHistoryPurchases(await fetchPurchasesForSpendHistory());
  }, []);

  const loadArchived = useCallback(async () => {
    setArchivedPurchases(await fetchPurchases({ archived: true }));
  }, []);

  const loadAcceptedShares = useCallback(async () => {
    const accepted = (await fetchReceivedInvites()).filter((invite) => invite.status === 'accepted');
    setAcceptedShares(accepted);
    return accepted;
  }, []);

  const applyPurchaseUpsert = useCallback((purchase: Purchase) => {
    setPurchases((current) => {
      const exists = current.some((item) => item.id === purchase.id);
      const next = (exists
        ? current.map((item) => (item.id === purchase.id ? purchase : item))
        : [...current, purchase]
      ).sort((left, right) => left.dDay - right.dDay);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {
        // The in-memory update is still valid when cache persistence fails.
      }
      return next;
    });
    setSpendHistoryPurchases((current) =>
      current.some((item) => item.id === purchase.id)
        ? current.map((item) => (item.id === purchase.id ? purchase : item))
        : [...current, purchase],
    );
  }, [cacheKey]);

  useEffect(() => {
    void load();
    void loadSpendHistory();
    void loadAcceptedShares();
  }, [load, loadAcceptedShares, loadSpendHistory]);

  useEffect(() => {
    const refresh = () => {
      void load().catch((error) => console.error('구매 목록 갱신 실패', error));
      void loadSpendHistory().catch((error) => console.error('지출 내역 갱신 실패', error));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'purchase-data-changed') refresh();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('remindue:data-refresh', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('remindue:data-refresh', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [load, loadSpendHistory]);

  return {
    purchases,
    setPurchases,
    spendHistoryPurchases,
    archivedPurchases,
    acceptedShares,
    purchasesLoaded,
    load,
    loadSpendHistory,
    loadArchived,
    loadAcceptedShares,
    applyPurchaseUpsert,
  };
}

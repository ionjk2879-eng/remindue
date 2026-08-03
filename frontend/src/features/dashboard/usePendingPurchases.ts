import { useCallback, useEffect, useState } from 'react';
import { fetchPendingPurchases } from '../../api/pendingPurchases';
import type { PendingPurchase } from '../../types';

export function usePendingPurchases() {
  const [pendingItems, setPendingItems] = useState<PendingPurchase[]>([]);
  const [forwardingEmail, setForwardingEmail] = useState('');

  const refreshPending = useCallback(async () => {
    const data = await fetchPendingPurchases();
    setForwardingEmail(data.forwardingEmail);
    setPendingItems(data.items);
  }, []);

  useEffect(() => {
    void refreshPending();
    const safelyRefresh = () => void refreshPending().catch((error) => console.error('확인 대기 목록 갱신 실패', error));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') safelyRefresh();
    };
    const intervalId = window.setInterval(safelyRefresh, 30_000);
    window.addEventListener('focus', safelyRefresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', safelyRefresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshPending]);

  return { pendingItems, setPendingItems, forwardingEmail, setForwardingEmail, refreshPending };
}

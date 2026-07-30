import { useState } from 'react';
import axios from 'axios';
import { cancelSubscription } from '../api/billing';
import { useAuth } from '../context/AuthContext';
import Skeleton from './Skeleton';

const PLAN_LABEL: Record<'ONE_TIME' | 'MONTHLY' | 'ANNUAL', string> = {
  ONE_TIME: '1회성 이용권',
  MONTHLY: '월 정기결제',
  ANNUAL: '연 정기결제',
};

function formatDateOnly(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/**
 * 현재 구독 상태(플랜·만료일) + 정기결제 해지 버튼 — SettingsPage와 PricingPage가 같이 쓴다.
 * 두 곳에서 각자 구현하면 이번에 겪은 것처럼(스타일이 갈라졌던 spending-detail 버그) 로직이
 * 슬쩍 갈라질 수 있어 한 곳에만 둔다.
 */
export default function SubscriptionStatus() {
  const { isPremium, billingStatus, refreshPremium } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const handleCancelSubscription = async () => {
    const confirmed = window.confirm(
      '해지하면 다음 결제일부터 자동 결제가 중단되고, 이미 결제된 기간까지는 프리미엄이 유지됩니다. 해지할까요?'
    );
    if (!confirmed) return;

    setCancelMessage(null);
    setCancelling(true);
    try {
      const result = await cancelSubscription();
      refreshPremium(result);
      setCancelMessage('정기결제를 해지했어요. 결제된 기간까지는 프리미엄이 유지됩니다.');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setCancelMessage(message ?? '해지하지 못했어요.');
    } finally {
      setCancelling(false);
    }
  };

  if (billingStatus === null) {
    return (
      <div className="skeleton-block">
        <Skeleton width="60%" />
        <Skeleton width="30%" />
      </div>
    );
  }

  if (!isPremium || !billingStatus.plan || (billingStatus.plan !== 'MONTHLY' && billingStatus.plan !== 'ANNUAL')) {
    return null;
  }

  return (
    <>
      {billingStatus.autoRenew ? (
        <div className="settings-subscription-row">
          <p className="settings-section__hint">
            {PLAN_LABEL[billingStatus.plan]} 이용 중
            {billingStatus.premiumExpiresAt && ` · ${formatDateOnly(billingStatus.premiumExpiresAt)}까지`}
          </p>
          <button className="btn btn-sm btn-outline" onClick={handleCancelSubscription} disabled={cancelling}>
            {cancelling ? '해지 중...' : '정기결제 해지'}
          </button>
        </div>
      ) : (
        <>
          <p className="settings-section__hint">
            {PLAN_LABEL[billingStatus.plan]} 이용 중
            {billingStatus.premiumExpiresAt && ` · ${formatDateOnly(billingStatus.premiumExpiresAt)}까지`}
          </p>
          <p className="settings-section__hint">자동 결제가 해지됐어요. 남은 기간까지는 프리미엄이 유지됩니다.</p>
        </>
      )}
      {cancelMessage && <p className="settings-section__message">{cancelMessage}</p>}
    </>
  );
}

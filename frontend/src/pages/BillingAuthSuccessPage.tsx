import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { issueBillingKey } from '../api/billing';
import { useAuth } from '../context/AuthContext';
import type { BillingPlan } from '../types';

type Status = 'confirming' | 'done' | 'error';

/** 월/연 정기결제 카드 등록(빌링 인증)이 성공 후 리다이렉트하는 곳 — authKey/customerKey로 빌링키를 발급받고 첫 결제를 확정한다. */
export default function BillingAuthSuccessPage() {
  const [searchParams] = useSearchParams();
  const { refreshPremium } = useAuth();
  const [status, setStatus] = useState<Status>('confirming');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const authKey = searchParams.get('authKey');
    const customerKey = searchParams.get('customerKey');
    const plan = searchParams.get('plan') as BillingPlan | null;

    if (!authKey || !customerKey || (plan !== 'MONTHLY' && plan !== 'ANNUAL')) {
      setStatus('error');
      setErrorMessage('결제 정보가 올바르지 않습니다.');
      return;
    }

    issueBillingKey({ authKey, customerKey, plan })
      .then((result) => {
        refreshPremium(result);
        setStatus('done');
      })
      .catch((err) => {
        console.error(err);
        const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
        setErrorMessage(message ?? '카드 등록 또는 첫 결제에 실패했습니다.');
        setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="billing-callback">
      {status === 'confirming' && <p className="billing-callback__message">카드 등록과 첫 결제를 처리하는 중이에요...</p>}
      {status === 'done' && (
        <>
          <p className="billing-callback__icon">✓</p>
          <p className="billing-callback__message">정기결제 등록이 완료됐어요!</p>
          <Link className="btn" to="/dashboard">
            대시보드로 이동
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="billing-callback__icon billing-callback__icon--error">⚠</p>
          <p className="billing-callback__message">{errorMessage}</p>
          <Link className="btn" to="/pricing">
            다시 시도하기
          </Link>
        </>
      )}
    </div>
  );
}

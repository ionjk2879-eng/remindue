import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { confirmPayment } from '../api/billing';
import { useAuth } from '../context/AuthContext';

type Status = 'confirming' | 'done' | 'error';

/** 1회성 결제창이 성공 후 리다이렉트하는 곳 — paymentKey/orderId/amount를 서버로 넘겨 승인을 확정한다. */
export default function BillingSuccessPage() {
  const [searchParams] = useSearchParams();
  const { refreshPremium } = useAuth();
  const [status, setStatus] = useState<Status>('confirming');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');

    if (!paymentKey || !orderId || !amount) {
      setStatus('error');
      setErrorMessage('결제 정보가 올바르지 않습니다.');
      return;
    }

    confirmPayment({ paymentKey, orderId, amount: Number(amount) })
      .then((result) => {
        refreshPremium(result);
        setStatus('done');
      })
      .catch((err) => {
        console.error(err);
        const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
        setErrorMessage(message ?? '결제 승인에 실패했습니다.');
        setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="billing-callback">
      {status === 'confirming' && <p className="billing-callback__message">결제를 확인하는 중이에요...</p>}
      {status === 'done' && (
        <>
          <p className="billing-callback__icon">✓</p>
          <p className="billing-callback__message">프리미엄 결제가 완료됐어요!</p>
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

import { useEffect, useState } from 'react';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { createCheckout } from '../api/billing';
import { fetchPurchases } from '../api/purchases';
import { useAuth } from '../context/AuthContext';
import type { BillingPlan } from '../types';

// client.ts의 VITE_API_BASE_URL과 동일한 이유의 폴백 — 순수 `vite`(로컬 개발, --mode 없음)는
// .env.dev/.env.production을 읽지 않으므로 로컬에서도 바로 동작하도록 테스트 키를 기본값으로 둔다.
const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY ?? 'test_ck_PBal2vxj81vzPEX56jqG35RQgOAN';
/** 무료 플랜 최대 등록 개수 — 백엔드 purchase-logic.ts의 FREE_PLAN_MAX_PURCHASES와 값을 맞춘다. */
const FREE_PLAN_MAX_PURCHASES = 5;

interface PlanCard {
  key: BillingPlan;
  title: string;
  price: string;
  note: string;
  badge?: string;
  recommended?: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  { key: 'ONE_TIME', title: '1회성 결제', price: '2,200원', note: '30일 이용 · 자동갱신 없음' },
  {
    key: 'MONTHLY',
    title: '월 정기결제',
    price: '1,900원',
    note: '매달 자동 결제',
    recommended: true,
  },
  // 19,000원/년은 1,900원×12개월(22,800원)보다 3,800원 싸다 — 딱 2개월치 요금이라 "2개월 무료 효과".
  { key: 'ANNUAL', title: '연 정기결제', price: '19,000원', note: '매년 자동 결제', badge: '2개월 무료 효과' },
];

export default function PricingPage() {
  const { isPremium } = useAuth();
  const [purchaseCount, setPurchaseCount] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<BillingPlan | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPurchases()
      .then((items) => setPurchaseCount(items.length))
      .catch(() => setPurchaseCount(null));
  }, []);

  const handlePay = async (plan: BillingPlan) => {
    setErrorMessage(null);
    setLoadingPlan(plan);
    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const { orderId, amount, orderName, customerKey } = await createCheckout(plan);
      const payment = tossPayments.payment({ customerKey });

      if (plan === 'ONE_TIME') {
        await payment.requestPayment({
          method: 'CARD',
          amount: { currency: 'KRW', value: amount },
          orderId,
          orderName,
          successUrl: `${window.location.origin}/billing/success`,
          failUrl: `${window.location.origin}/billing/fail`,
        });
      } else {
        await payment.requestBillingAuth({
          method: 'CARD',
          successUrl: `${window.location.origin}/billing/auth-success?plan=${plan}`,
          failUrl: `${window.location.origin}/billing/fail`,
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('결제창을 여는 데 실패했어요. 잠시 후 다시 시도해주세요.');
      setLoadingPlan(null);
    }
  };

  const showLimitBanner = !isPremium && purchaseCount !== null && purchaseCount >= FREE_PLAN_MAX_PURCHASES;

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <h1>
          Remindue <span className="accent">Premium</span>
        </h1>
        <p className="pricing-header__subtitle">흩어진 정기배송을 놓치지 않게</p>
        {showLimitBanner && (
          <p className="pricing-header__limit-notice">
            현재 등록 개수: <span className="mono">{purchaseCount}/{FREE_PLAN_MAX_PURCHASES}</span> — 무료 플랜 한도에 도달했어요
          </p>
        )}
      </div>

      {errorMessage && <p className="form-error">{errorMessage}</p>}

      <div className="pricing-cards">
        {PLAN_CARDS.map((card) => (
          <div className={`pricing-card${card.recommended ? ' pricing-card--recommended' : ''}`} key={card.key}>
            {card.recommended && <span className="pricing-card__star">⭐ 추천</span>}
            <p className="pricing-card__title">{card.title}</p>
            <p className="pricing-card__price">
              {card.price}
              {card.key !== 'ONE_TIME' && <span className="pricing-card__unit">{card.key === 'MONTHLY' ? '/월' : '/년'}</span>}
            </p>
            {card.badge && <span className="pricing-card__badge">{card.badge}</span>}
            <p className="pricing-card__note">{card.note}</p>
            <button
              type="button"
              className="btn pricing-card__btn"
              onClick={() => handlePay(card.key)}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === card.key ? '이동 중...' : '결제하기'}
            </button>
          </div>
        ))}
      </div>

      <table className="pricing-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>무료</th>
            <th>프리미엄</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>등록 개수</td>
            <td>5개</td>
            <td>무제한</td>
          </tr>
          <tr>
            <td>이번 주 배송 요약</td>
            <td>X</td>
            <td>O</td>
          </tr>
          <tr>
            <td>커스텀 알림 시점</td>
            <td>7/3/1/당일 고정</td>
            <td>직접 설정</td>
          </tr>
          <tr>
            <td>CSV/PDF 내보내기</td>
            <td>X</td>
            <td>O</td>
          </tr>
          <tr>
            <td>가족/구성원 공유</td>
            <td>X</td>
            <td>O</td>
          </tr>
          <tr>
            <td>이력 보관(아카이브)</td>
            <td>X</td>
            <td>O</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

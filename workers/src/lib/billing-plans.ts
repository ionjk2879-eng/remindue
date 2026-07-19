// 결제 금액/주기 설정 — 반드시 이 한 곳에서만 정의한다(billing.ts의 최초 결제/구독 전환,
// billing-renewal.ts의 자동 갱신 청구가 같은 값을 봐야 금액이 어긋나지 않는다).
// 금액은 항상 서버가 정하고 클라이언트가 보낸 값은 신뢰하지 않는다 — routes/billing.ts 참고.

import type { BillingPlan } from '../types';

export interface PlanConfig {
  amount: number;
  orderName: string;
  /** SQLite datetime() modifier — 만료일 계산에 그대로 bind해서 쓴다 (예: datetime(x, '+1 month')). */
  periodModifier: string;
  autoRenew: boolean;
}

export const PLAN_CONFIG: Record<BillingPlan, PlanConfig> = {
  ONE_TIME: { amount: 2200, orderName: 'Remindue 프리미엄 1회 이용권(30일)', periodModifier: '+30 days', autoRenew: false },
  MONTHLY: { amount: 1900, orderName: 'Remindue 프리미엄 월 정기결제', periodModifier: '+1 month', autoRenew: true },
  ANNUAL: { amount: 19000, orderName: 'Remindue 프리미엄 연 정기결제', periodModifier: '+1 year', autoRenew: true },
};

/** 이메일/화면에 노출하는 한국어 플랜 이름 — billing.ts(해지 안내 메일), billing-renewal.ts(실패 안내 메일) 공용. */
export const PLAN_LABEL: Record<BillingPlan, string> = {
  ONE_TIME: '1회성 이용권',
  MONTHLY: '월 정기결제',
  ANNUAL: '연 정기결제',
};

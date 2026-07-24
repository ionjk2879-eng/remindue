export type PurchaseType = 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY' | 'SUBSCRIPTION';
export type ScheduleType = 'INTERVAL' | 'FIXED_DAY';
/** 정기배송/구독 전용 지출 카테고리 — 대시보드 "카테고리별 분석"에 쓴다. 그 외 타입은 항상 null. */
export type PurchaseCategory = 'STREAMING' | 'SHOPPING' | 'FOOD' | 'SOFTWARE' | 'OTHER';

/** RECURRING_DELIVERY(실물 정기배송)와 SUBSCRIPTION(디지털 정기구독)은 라벨/색상만 다르고
 *  스케줄(다음 일정, 회차, 확인 버튼 등)은 완전히 동일하게 동작한다. */
export function isRecurringType(type: PurchaseType): boolean {
  return type === 'RECURRING_DELIVERY' || type === 'SUBSCRIPTION';
}

export interface Purchase {
  id: number;
  type: PurchaseType;
  itemName: string;
  baseDate: string; // yyyy-MM-dd
  amount: number | null;
  memo: string | null;
  warrantyMonths: number | null;
  returnDeadlineDays: number | null;
  intervalDays: number | null;
  scheduleType: ScheduleType;
  fixedDayOfMonth: number | null;
  lastDeliveredDate: string | null;
  deadline: string;
  dDay: number;
  deliveryRound: number | null;
  archivedAt: string | null;
  category: PurchaseCategory | null;
  /** "이번 회차 확인"을 누른 누적 횟수 — "AI 절약 제안"(장기 미확인 구독 추천)에 쓴다. */
  deliveryConfirmCount: number;
  /** 판매처/브랜드명. AI 이메일 추출 시 자동 감지. null이면 미감지. */
  brand: string | null;
  createdAt: string;
}

export interface PurchaseInput {
  type: PurchaseType;
  itemName: string;
  baseDate: string;
  amount?: number;
  memo?: string;
  warrantyMonths?: number;
  returnDeadlineDays?: number;
  intervalDays?: number;
  scheduleType?: ScheduleType;
  fixedDayOfMonth?: number | null;
  category?: PurchaseCategory | null;
  brand?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  nickname: string;
  isPremium: boolean;
  hasSeenOnboarding: boolean;
}

export type PendingPurchaseSource = 'email' | 'image';
export type PendingPurchaseStatus = 'pending' | 'confirmed' | 'ignored';

export interface PendingPurchase {
  id: number;
  source: PendingPurchaseSource;
  type: PurchaseType;
  itemName: string | null;
  orderDate: string | null; // yyyy-MM-dd
  expectedDeliveryDate: string | null; // yyyy-MM-dd — 정기배송이면 다음 배송일
  /** AI가 추정한 반품/교환 가능 일수. */
  returnDeadlineDays: number | null;
  /** true면 메일에 명시된 값이 아니라 법정 최소 기준(7일)으로 추정한 값. */
  returnDeadlineEstimated: boolean;
  /** RECURRING_DELIVERY/SUBSCRIPTION 전용: 배송·결제 주기(일수). */
  intervalDays: number | null;
  scheduleType: ScheduleType;
  fixedDayOfMonth: number | null;
  /** true면 원본(이메일/이미지)에 주기·고정일이 명시되지 않아 30일 기본값으로 추정한 값. */
  scheduleEstimated: boolean;
  /** AI가 추출한 금액(원). 원본에 없으면 null. */
  amount: number | null;
  /** AI가 추정한 지출 카테고리(RECURRING_DELIVERY/SUBSCRIPTION만). 그 외 null. */
  category: PurchaseCategory | null;
  /** 판매처/브랜드명. AI 이메일 추출 시 자동 감지. null이면 미감지. */
  brand: string | null;
  /** 같은 상품명의 기존 활성 항목과 매칭됐고 금액이 달라졌을 때만 그 항목의 id — "가격 인상 감지". 그 외 null. */
  matchedPurchaseId: number | null;
  /** matchedPurchaseId가 있을 때 그 항목의 변경 전 금액. 그 외 null. */
  previousAmount: number | null;
  status: PendingPurchaseStatus;
  createdAt: string;
}

export interface PendingPurchasesResponse {
  forwardingEmail: string;
  items: PendingPurchase[];
}

export type BillingPlan = 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';

export interface BillingStatus {
  isPremium: boolean;
  plan: BillingPlan | null;
  premiumExpiresAt: string | null;
  autoRenew: boolean;
  premiumSince: string | null;
  paymentCount: number;
}

export interface CheckoutResponse {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
}

export type SharedAccessStatus = 'pending' | 'accepted';

export interface SharedAccess {
  id: number;
  counterpart: string;
  status: SharedAccessStatus;
  createdAt: string;
}

export type FeedbackCategory = 'BUG' | 'FEATURE_REQUEST' | 'QUESTION' | 'OTHER';
export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface FeedbackListItem {
  id: number;
  category: FeedbackCategory;
  title: string;
  status: FeedbackStatus;
  authorNickname: string;
  replyCount: number;
  createdAt: string;
}

export interface FeedbackReply {
  id: number;
  content: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface FeedbackDetail {
  id: number;
  category: FeedbackCategory;
  title: string;
  content: string;
  status: FeedbackStatus;
  authorNickname: string;
  /** 조회자가 이 글의 작성자 본인인지 — 답글 작성 폼 노출 여부에 쓴다. */
  isMine: boolean;
  /** 조회자가 운영자인지 — 상태 변경 UI 노출 여부에 쓴다. */
  viewerIsAdmin: boolean;
  createdAt: string;
  replies: FeedbackReply[];
}

export interface FeedbackInput {
  category: FeedbackCategory;
  title: string;
  content: string;
}

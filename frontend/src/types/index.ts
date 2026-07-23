export type PurchaseType = 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY';
export type ScheduleType = 'INTERVAL' | 'FIXED_DAY';

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
  /** RECURRING_DELIVERY 전용: 배송 주기(일수). null이면 메일에 명시 안 됨. */
  intervalDays: number | null;
  scheduleType: ScheduleType;
  fixedDayOfMonth: number | null;
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

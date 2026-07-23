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

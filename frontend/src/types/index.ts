export type PurchaseType = 'GENERAL' | 'RECURRING_DELIVERY' | 'SUBSCRIPTION';
export type ScheduleType = 'INTERVAL' | 'FIXED_DAY';
/** 서비스 카테고리 — 모든 구매 유형에 적용된다(GENERAL 포함). */
export type PurchaseCategory = 'SOFTWARE' | 'AI' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'HAIR_BODY' | 'SKINCARE' | 'PET' | 'ELECTRONICS' | 'CREATOR_SUPPORT' | 'CLOUD' | 'OTHER';

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
  /** 정기 항목이지만 최초 1회만 사용. 목록은 유지하고 이후 지출·유지 확인만 제외한다. */
  isOneTime: boolean;
  /** RECURRING_DELIVERY 전용 스케줄 앵커("최초 도착(예정)일") — 없으면(null) baseDate가 대신 앵커로 쓰인다. */
  expectedDeliveryDate: string | null;
  lastDeliveredDate: string | null;
  arrivalCheckSnoozedUntil: string | null;
  /** "가장 급한" 기한 — GENERAL이고 반품기한/A·S보증 둘 다 있으면 더 급한 쪽. */
  deadline: string;
  dDay: number;
  deliveryRound: number | null;
  archivedAt: string | null;
  /** "삭제"(취소와 다름) 시각. discard된 항목은 목록 조회에 안 잡히므로 사실상 항상 null. */
  discardedAt: string | null;
  category: PurchaseCategory | null;
  /** GENERAL이고 returnDeadlineDays가 있을 때만: baseDate + returnDeadlineDays. 그 외 null. */
  returnDeadlineDate: string | null;
  returnDeadlineDDay: number | null;
  /** GENERAL이고 warrantyMonths가 있을 때만: baseDate + warrantyMonths. 그 외 null. */
  warrantyDeadlineDate: string | null;
  warrantyDeadlineDDay: number | null;
  /** "유지하기"(이번 회차 확인)를 누른 누적 횟수 — 연속 미확인 회차 수 계산에 쓴다. */
  deliveryConfirmCount: number;
  /** 사용자가 "유지 안 함"을 누른 시각. null이면 미확인일 뿐(사용 안 함으로 해석 금지). */
  discontinuedAt: string | null;
  /** 판매처/브랜드명. AI 이메일 추출 시 자동 감지. null이면 미감지. */
  brand: string | null;
  /** brand의 공식 도메인(로고 표시용). AI가 확신할 때만 채움. */
  brandDomain: string | null;
  /** 외화 결제 원본 금액(소수점 유지). 원화 결제/수동 등록이면 null. */
  originalAmount: number | null;
  /** 외화 결제 원본 통화 코드(ISO 4217). 원화 결제/수동 등록이면 null. */
  originalCurrency: string | null;
  /** 결제일 기준 적용 환율(1 originalCurrency = N KRW). 원화 결제면 null. */
  exchangeRate: number | null;
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
  isOneTime?: boolean;
  /** RECURRING_DELIVERY 전용 — 스케줄 앵커. GENERAL은 정보용으로만 저장되고 계산엔 영향 없다. */
  expectedDeliveryDate?: string | null;
  category?: PurchaseCategory | null;
  brand?: string | null;
  brandDomain?: string | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  exchangeRate?: number | null;
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
  /** AI가 GENERAL 항목을 전자제품으로 판단했을 때만 기본값(12)이 채워짐. 그 외 null. */
  warrantyMonths: number | null;
  /** RECURRING_DELIVERY/SUBSCRIPTION 전용: 배송·결제 주기(일수). */
  intervalDays: number | null;
  scheduleType: ScheduleType;
  fixedDayOfMonth: number | null;
  /** true면 원본(이메일/이미지)에 주기·고정일이 명시되지 않아 30일 기본값으로 추정한 값. */
  scheduleEstimated: boolean;
  /** AI가 추출한 금액(원). 원본에 없으면 null. */
  amount: number | null;
  /** AI가 추정한 서비스 카테고리 — 모든 구매 유형에 적용. 판단 불가면 null. */
  category: PurchaseCategory | null;
  /** 판매처/브랜드명. AI 이메일 추출 시 자동 감지. null이면 미감지. */
  brand: string | null;
  /** brand의 공식 도메인(로고 표시용). AI가 확신할 때만 채움. */
  brandDomain: string | null;
  /** 외화 결제 원본 금액(소수점 유지). 원화 결제면 null. */
  originalAmount: number | null;
  /** 외화 결제 원본 통화 코드(ISO 4217). 원화 결제면 null. */
  originalCurrency: string | null;
  /** 결제일 기준 적용 환율(1 originalCurrency = N KRW). 원화 결제면 null. */
  exchangeRate: number | null;
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
  /** 비밀글이고 내가 작성자/운영자가 아니면 "🔒 비밀글입니다"로 마스킹돼서 온다. */
  title: string;
  status: FeedbackStatus;
  authorNickname: string;
  replyCount: number;
  isPrivate: boolean;
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
  isPrivate: boolean;
  createdAt: string;
  replies: FeedbackReply[];
}

export interface FeedbackInput {
  category: FeedbackCategory;
  title: string;
  content: string;
  isPrivate?: boolean;
}

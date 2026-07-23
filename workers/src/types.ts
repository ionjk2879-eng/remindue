export type PurchaseType = 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY';
export type ScheduleType = 'INTERVAL' | 'FIXED_DAY';

export const PURCHASE_TYPES: readonly PurchaseType[] = ['ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY'];

// D1 row shape (snake_case columns from migrations/0001_init.sql)
export interface PurchaseRow {
  id: number;
  user_id: number;
  type: PurchaseType;
  item_name: string;
  base_date: string;
  amount: number | null;
  memo: string | null;
  warranty_months: number | null;
  return_deadline_days: number | null;
  interval_days: number | null;
  /** 정기배송/구독 스케줄 방식: INTERVAL(N일마다) 또는 FIXED_DAY(매월 특정일). 기본 INTERVAL. */
  schedule_type: ScheduleType;
  /** FIXED_DAY일 때만 사용: 매월 결제/배송되는 날짜(1~31). */
  fixed_day_of_month: number | null;
  last_delivered_date: string | null;
  delivery_confirm_count: number;
  /** 이력 보관(프리미엄). NULL이면 활성 항목, 값이 있으면 그 시각에 보관 처리됨 — dDay/알림 대상에서 제외. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  nickname: string;
  created_at: string;
  /** SQLite boolean(0/1) — 매일 D-day 다이제스트 이메일 수신 여부. 기본값 1(켜짐). */
  email_notifications_enabled: number;
  /** add-{forwarding_token}@{도메인}으로 온 메일을 이 사용자로 식별하는 고유 토큰. */
  forwarding_token: string;
  /**
   * SQLite boolean(0/1) — 프리미엄 접근 권한(무제한 등록, 주간 요약, 커스텀 알림 시점, 내보내기, 공유, 보관).
   * 빠른 체크용 캐시 값이고, premium_expires_at이 실제 만료 시각의 근거다(결제 크론이 매일
   * premium_expires_at을 기준으로 이 값을 갱신/만료 처리한다). premium_expires_at이 NULL인데
   * is_premium=1인 계정은 결제 연동 이전부터 열려있던 계정이라 결제 로직이 건드리지 않는다.
   */
  is_premium: number;
  /** 결제로 관리되는 프리미엄 만료 시각(datetime 문자열). NULL이면 결제 미관리 계정. */
  premium_expires_at: string | null;
  /** 토스 자동결제(빌링) API의 고객 식별자. 결제를 한 번도 시도하지 않았으면 NULL. */
  toss_customer_key: string | null;
  /**
   * 커스텀 알림 시점(프리미엄) — "며칠 전에 알릴지"를 콤마로 구분한 정수 목록(예: "7,3,1,0").
   * 무료 플랜은 is_premium 여부와 무관하게 라우트에서 항상 기본값 "7,3,1,0"으로 강제하므로,
   * 이 컬럼에 남아있는 값은 사실상 프리미엄이었을 때 저장해둔 값 — 다시 프리미엄이 되면 그대로
   * 되살아난다(무료로 내려갔다고 값을 지우지 않는다).
   */
  notification_days: string;
  /** SQLite boolean(0/1) — 3단계 온보딩 안내를 완료했거나 건너뛰었는지. 둘 다 이 값을 1로 저장한다(routes/settings.ts). */
  has_seen_onboarding: number;
}

export type PendingPurchaseSource = 'email' | 'image';
export type PendingPurchaseStatus = 'pending' | 'confirmed' | 'ignored';

// D1 row shape (snake_case columns from migrations/0006_add_pending_purchases.sql,
// raw_excerpt dropped in 0007 — 원본 메일은 저장하지 않는다. type/return_deadline_days/
// return_deadline_estimated는 0009에서 추가, return_deadline(절대 날짜)는 0009에서 제거).
export interface PendingPurchaseRow {
  id: number;
  user_id: number;
  source: PendingPurchaseSource;
  type: PurchaseType;
  item_name: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  /** AI가 추정한 반품/교환 가능 일수(명시 안 됐으면 서버가 법정 최소 기준 7일로 채움). */
  return_deadline_days: number | null;
  /** SQLite boolean(0/1) — true면 return_deadline_days가 메일에 명시된 값이 아니라 추정값. */
  return_deadline_estimated: number;
  /** RECURRING_DELIVERY 전용: 배송 주기(일수). INTERVAL 방식일 때만 의미 있음. */
  interval_days: number | null;
  schedule_type: ScheduleType;
  fixed_day_of_month: number | null;
  status: PendingPurchaseStatus;
  created_at: string;
}

// API response shape — matches frontend/src/types/index.ts exactly (camelCase).
export interface PendingPurchaseResponse {
  id: number;
  source: PendingPurchaseSource;
  type: PurchaseType;
  itemName: string | null;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  returnDeadlineDays: number | null;
  returnDeadlineEstimated: boolean;
  intervalDays: number | null;
  scheduleType: ScheduleType;
  fixedDayOfMonth: number | null;
  status: PendingPurchaseStatus;
  createdAt: string;
}

// API response shape — matches frontend/src/types/index.ts exactly (camelCase).
export interface PurchaseResponse {
  id: number;
  type: PurchaseType;
  itemName: string;
  baseDate: string;
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
  /** RECURRING_DELIVERY 전용 — 몇 회차인지(1부터 시작). 그 외 타입은 null. */
  deliveryRound: number | null;
  /** 이력 보관(프리미엄) 시각. null이면 활성 항목. */
  archivedAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface PushSubscriptionRequestBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface AuthResponse {
  accessToken: string;
  nickname: string;
  isPremium: boolean;
  hasSeenOnboarding: boolean;
}

export interface PurchaseRequestBody {
  type: PurchaseType;
  itemName: string;
  baseDate: string;
  amount?: number | null;
  memo?: string | null;
  warrantyMonths?: number | null;
  returnDeadlineDays?: number | null;
  intervalDays?: number | null;
  scheduleType?: ScheduleType;
  fixedDayOfMonth?: number | null;
}

export type BillingPlan = 'ONE_TIME' | 'MONTHLY' | 'ANNUAL';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'EXPIRED';
export type PaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

// D1 row shape (snake_case columns from migrations/0011_add_billing_tables.sql)
export interface SubscriptionRow {
  id: number;
  user_id: number;
  plan: BillingPlan;
  status: SubscriptionStatus;
  auto_renew: number;
  toss_billing_key: string | null;
  current_period_end: string;
  failed_charge_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: number;
  user_id: number;
  subscription_id: number | null;
  order_id: string;
  payment_key: string | null;
  plan: BillingPlan;
  amount: number;
  status: PaymentStatus;
  failure_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface BillingStatusResponse {
  isPremium: boolean;
  plan: BillingPlan | null;
  premiumExpiresAt: string | null;
  autoRenew: boolean;
  /** 최초 결제 승인 시각(datetime). 결제 이력이 없는 계정(결제 연동 이전부터 프리미엄이었던 계정 등)은 null. */
  premiumSince: string | null;
  /** 성공한 결제(CONFIRMED) 총 횟수 — "몇 회차"에 쓴다. */
  paymentCount: number;
}

export type SharedAccessStatus = 'pending' | 'accepted';

// D1 row shape (snake_case columns from migrations/0012_add_notification_prefs_archive_sharing.sql)
export interface SharedAccessRow {
  id: number;
  owner_user_id: number;
  shared_with_email: string;
  status: SharedAccessStatus;
  created_at: string;
  accepted_at: string | null;
}

export interface SharedAccessResponse {
  id: number;
  /** 내가 초대한 목록에서는 상대 이메일, 내가 초대받은 목록에서는 초대한 사람의 닉네임. */
  counterpart: string;
  status: SharedAccessStatus;
  createdAt: string;
}

export type FeedbackCategory = 'BUG' | 'FEATURE_REQUEST' | 'QUESTION' | 'OTHER';

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = ['BUG', 'FEATURE_REQUEST', 'QUESTION', 'OTHER'];

export type FeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

// D1 row shape (snake_case columns from migrations/0014_add_feedback.sql)
export interface FeedbackRow {
  id: number;
  user_id: number;
  category: FeedbackCategory;
  title: string;
  content: string;
  status: FeedbackStatus;
  created_at: string;
}

export interface FeedbackReplyRow {
  id: number;
  feedback_id: number;
  content: string;
  /** SQLite boolean(0/1) — 1이면 운영자(Env.ADMIN_EMAIL) 답글, 0이면 글쓴이 본인 답글. */
  is_admin: number;
  created_at: string;
}

export interface FeedbackListItemResponse {
  id: number;
  category: FeedbackCategory;
  title: string;
  status: FeedbackStatus;
  authorNickname: string;
  replyCount: number;
  createdAt: string;
}

export interface FeedbackReplyResponse {
  id: number;
  content: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface FeedbackDetailResponse {
  id: number;
  category: FeedbackCategory;
  title: string;
  content: string;
  status: FeedbackStatus;
  authorNickname: string;
  /** 조회자가 이 글의 작성자 본인인지 — 답글 작성 폼 노출 여부에 쓴다. */
  isMine: boolean;
  /** 조회자가 운영자(Env.ADMIN_EMAIL)인지 — 상태 변경 UI 노출 여부에 쓴다. */
  viewerIsAdmin: boolean;
  createdAt: string;
  replies: FeedbackReplyResponse[];
}

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  /** 콤마로 구분된 허용 출처 목록(예: "https://remindue.kr,https://remindue-frontend.ionjk2879.workers.dev"). index.ts의 allowedOrigins()가 파싱한다. */
  CORS_ORIGIN: string;
  /** 다이제스트 이메일/푸시에 넣을 대시보드 링크의 기준 출처(단일 URL). CORS_ORIGIN은 콤마로 구분된 여러 출처를 담을 수 있어 링크 조립에는 쓸 수 없다. */
  APP_URL: string;
  /** Resend API 키. 로컬은 .dev.vars, 배포본은 `wrangler secret put RESEND_API_KEY`로 관리한다. */
  RESEND_API_KEY: string;
  /** VAPID 키 쌍 — `npx web-push generate-vapid-keys`로 생성. 공개키는 프론트에도 노출되는 값이라 비밀은 아니지만, 개인키는 반드시 시크릿으로 관리한다. */
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  /** web-push 스펙상 필수인 연락처 식별자(mailto: 또는 https: URL). */
  VAPID_SUBJECT: string;
  /** Claude API 키. 이메일 포워딩으로 들어온 주문확인 메일 파싱에 사용(claude-haiku-4-5). */
  ANTHROPIC_API_KEY: string;
  /**
   * 토스페이먼츠 시크릿 키(Basic Auth 아이디로 사용, 서버 전용) — 결제 승인/빌링키 발급/자동결제
   * 청구 API 호출에 쓴다. 프론트엔드용 client key(VITE_TOSS_CLIENT_KEY)는 비밀이 아니라 여기
   * Env에 넣지 않고 frontend/.env.dev · .env.production에 별도로 둔다.
   */
  TOSS_SECRET_KEY: string;
  /** 이메일 포워딩 수신 주소에 쓰는 도메인(add-{token}@{도메인}). Cloudflare Email Routing이 붙어있는 도메인. */
  FORWARDING_EMAIL_DOMAIN: string;
  /** 새 문의 알림 메일을 받을 운영자 이메일. 이 이메일로 로그인한 사용자는 모든 문의에 답글을 남길 수 있다(routes/feedback.ts). */
  ADMIN_EMAIL: string;
  /**
   * "production"(기본, wrangler.jsonc) 또는 "development"(로컬 .dev.vars, dev 프리뷰 배포 시
   * `--var ENVIRONMENT:development`). 개발 전용 기능(테스트 시드 엔드포인트, 주간 다이제스트
   * 요일 제한 우회)을 production에서 절대 켜지지 않게 가드하는 용도.
   */
  ENVIRONMENT: string;
}

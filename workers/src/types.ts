export type PurchaseType = 'ELECTRONICS' | 'ONLINE_ORDER' | 'RECURRING_DELIVERY';

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
  last_delivered_date: string | null;
  delivery_confirm_count: number;
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
  /** SQLite boolean(0/1) — 프리미엄 알림 기능(놓친 배송 감지/주간 요약) 접근 권한. 결제 연동 전까지는 기본값 1(전부 무료로 열어둠). */
  is_premium: number;
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
  lastDeliveredDate: string | null;
  deadline: string;
  dDay: number;
  /** RECURRING_DELIVERY 전용 — 몇 회차 배송인지(1부터 시작). 그 외 타입은 null. */
  deliveryRound: number | null;
  /** RECURRING_DELIVERY 전용 — 계산상 회차 대비 "이번 회차 수령 확인" 누른 횟수가 부족한 만큼. 그 외 타입은 null. */
  missedConfirmations: number | null;
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
  /** 이메일 포워딩 수신 주소에 쓰는 도메인(add-{token}@{도메인}). Cloudflare Email Routing이 붙어있는 도메인. */
  FORWARDING_EMAIL_DOMAIN: string;
  /**
   * "production"(기본, wrangler.jsonc) 또는 "development"(로컬 .dev.vars, dev 프리뷰 배포 시
   * `--var ENVIRONMENT:development`). 개발 전용 기능(테스트 시드 엔드포인트, 주간 다이제스트
   * 요일 제한 우회)을 production에서 절대 켜지지 않게 가드하는 용도.
   */
  ENVIRONMENT: string;
}

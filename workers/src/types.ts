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
}

export type PendingPurchaseSource = 'email' | 'image';
export type PendingPurchaseStatus = 'pending' | 'confirmed' | 'ignored';

// D1 row shape (snake_case columns from migrations/0006_add_pending_purchases.sql,
// raw_excerpt dropped in 0007 — 원본 메일은 저장하지 않는다).
export interface PendingPurchaseRow {
  id: number;
  user_id: number;
  source: PendingPurchaseSource;
  item_name: string | null;
  order_date: string | null;
  return_deadline: string | null;
  expected_delivery_date: string | null;
  status: PendingPurchaseStatus;
  created_at: string;
}

// API response shape — matches frontend/src/types/index.ts exactly (camelCase).
export interface PendingPurchaseResponse {
  id: number;
  source: PendingPurchaseSource;
  itemName: string | null;
  orderDate: string | null;
  returnDeadline: string | null;
  expectedDeliveryDate: string | null;
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
}

export type PurchaseType = 'GENERAL' | 'RECURRING_DELIVERY' | 'SUBSCRIPTION';
export type ScheduleType = 'INTERVAL' | 'FIXED_DAY';
/** 서비스 카테고리 — 이제 모든 구매 유형에 적용된다(GENERAL 포함). 대시보드의 "카테고리별
 *  분석" 보드 자체는 정기배송/구독 지출 전용으로 남아있지만, 필드는 GENERAL도 채울 수 있다. */
export type PurchaseCategory = 'SOFTWARE' | 'AI' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'HAIR_BODY' | 'SKINCARE' | 'PET' | 'ELECTRONICS' | 'CREATOR_SUPPORT' | 'CLOUD' | 'OTHER';

export const PURCHASE_TYPES: readonly PurchaseType[] = ['GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION'];
export const PURCHASE_CATEGORIES: readonly PurchaseCategory[] = ['SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY', 'SKINCARE', 'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER'];

/** RECURRING_DELIVERY(실물 정기배송)와 SUBSCRIPTION(디지털 정기구독)은 라벨/색상, 스케줄 방식
 *  선택(INTERVAL/FIXED_DAY)·회차·확인 버튼 등은 완전히 동일하다 — 이 둘을 묶어 판단할 때는
 *  항상 이 헬퍼를 쓴다. 단, 스케줄의 "앵커 날짜"만은 다르다 — usesArrivalDate 참고. */
export function isRecurringType(type: PurchaseType): boolean {
  return type === 'RECURRING_DELIVERY' || type === 'SUBSCRIPTION';
}

/**
 * GENERAL/RECURRING_DELIVERY만 true(=SUBSCRIPTION만 false) — 실물이 배송되는 두 타입은 스토어가
 * 정한(또는 유저가 정한) "도착(예정)일"이 실질적인 기산점이고, base_date(구매/신청일)와는 별개다.
 * RECURRING_DELIVERY는 이 날짜가 배송 사이클의 위상 기준점(구매 시점은 주기와 무관한 날일 수
 * 있다), GENERAL은 반품기한(7일)·A/S 보증(1년) 기산점(보통 "받은 날"부터 세지 "결제한 날"부터
 * 세지 않는다)으로 각각 다르게 쓰이지만, 앵커 자체(expected_delivery_date ?? base_date)는 같은
 * 규칙이다. SUBSCRIPTION은 실물 배송 개념이 없어 여전히 base_date가 유일한 기준이다.
 * purchase-logic.ts computeDeadlines와 도착 확인 알림(arrival-confirm.ts) 대상 판정이 이 값을 쓴다.
 */
export function usesArrivalDate(type: PurchaseType): boolean {
  return type !== 'SUBSCRIPTION';
}

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
  /** 정기 항목을 한 번만 사용해 보는 경우 1. 목록에는 남지만 이후 회차·유지 확인은 만들지 않는다. */
  is_one_time: number;
  last_delivered_date: string | null;
  /**
   * GENERAL/RECURRING_DELIVERY 전용 도착(예정)일 앵커(usesArrivalDate). NULL이면 base_date(구매일)가
   * 대신 앵커 역할을 한다(기존 행 호환). RECURRING_DELIVERY는 배송 사이클의 위상 기준점, GENERAL은
   * 반품기한(7일)·A/S 보증(1년) 기산점으로 쓰인다(purchase-logic.ts computeDeadlines). 도착 확인
   * 알림에서 "받았어요 + N일 전"을 답하면 그 실제 도착일로 갱신된다 — 이건 예전에 제거된
   * "last_delivered_date 기준 드리프트"(파일 상단 주석 참고)와 다르다: 여기서는 침묵이나 버튼
   * 클릭 시점이 아니라 사용자가 명시적으로 답한 "실제 도착일"만 앵커를 옮긴다. SUBSCRIPTION은
   * 항상 NULL(실물 배송이 없어 도착일 개념 자체가 없다).
   */
  expected_delivery_date: string | null;
  /** "오늘 받으셨나요?" 알림에서 "아직요"를 누르면 내일 날짜가 채워져 하루 뒤 재발송 대상이 된다.
   *  확인이 끝나면(받았어요) NULL로 되돌아간다. RECURRING_DELIVERY 외에는 항상 NULL. */
  arrival_check_snoozed_until: string | null;
  delivery_confirm_count: number;
  /**
   * 사용자가 "유지 안 함"을 눌러 명시적으로 표시한 시각. NULL이면 그냥 미확인일 뿐 — 침묵을
   * "사용 안 함"으로 해석하지 않는다. "유지하기"(mark-delivered)를 다시 누르면 NULL로 되돌아간다.
   */
  discontinued_at: string | null;
  /** 유지 확인에서 "모두 중단"을 선택했을 때, 현재 회차를 마친 뒤 종료할 예정일. */
  stop_after_current_at: string | null;
  renewal_decision_for: string | null;
  /** GENERAL 항목의 반품/A·S 기한 알림을 사용자가 더는 받지 않기로 한 시각. */
  deadline_notifications_disabled_at: string | null;
  /** 이력 보관(프리미엄). NULL이면 활성 항목, 값이 있으면 그 시각에 보관 처리됨 — dDay/알림 대상에서 제외. */
  archived_at: string | null;
  /**
   * "삭제"(취소와 다름) 시각. NULL이면 정상. 값이 있으면 목록/알림에서 완전히 빠지지만, 실제
   * 발생한 지출이라 월별·연간 지출 통계에서는 계속 집계된다(정기 항목은 이 시각 이후 회차만
   * 제외 — computeSpendCutoff 참고). "이미 지난 걸 목록에서 치우고 싶다"는 요청에 대응하되
   * 지출 기록은 잃지 않기 위한 구분. 주문 자체가 무효였거나 환불받아 지출로 안 칠 항목은
   * discard가 아니라 DELETE(하드 삭제, "취소")를 쓴다.
   */
  discarded_at: string | null;
  /** 서비스 카테고리 — 모든 구매 유형에 적용. 미지정이면 NULL. */
  category: PurchaseCategory | null;
  category_tags: string | null;
  /** 판매처/브랜드명. AI 이메일 추출 시 자동 감지. 수동 등록이면 NULL. */
  brand: string | null;
  /** brand의 공식 도메인(로고 표시용). AI가 확신할 때만 채움. */
  brand_domain: string | null;
  /** 외화 결제 원본 금액(소수점 유지). 원화 결제/수동 등록이면 NULL. */
  original_amount: number | null;
  /** 외화 결제 원본 통화 코드(ISO 4217). 원화 결제/수동 등록이면 NULL. */
  original_currency: string | null;
  /** 결제일(order_date) 기준 적용 환율(1 original_currency = N KRW). 원화 결제면 NULL. */
  exchange_rate: number | null;
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
  /** 정기배송·구독 유지 확인 전용 D-day 설정. */
  renewal_notification_days: string;
  /**
   * "확인이 필요한 항목" 예고 알림(confirmation-nudge.ts)이 결제/배송 며칠 전에 올지. 기본 3.
   * notification_days와 같은 원칙 — 무료는 항상 3으로 강제(effectiveConfirmationAdvanceDays),
   * 프리미엄만 이 저장값을 실제로 쓴다.
   */
  confirmation_advance_days: number;
  /** SQLite boolean(0/1) — 3단계 온보딩 안내를 완료했거나 건너뛰었는지. 둘 다 이 값을 1로 저장한다(routes/settings.ts). */
  has_seen_onboarding: number;
  /** 무료 플랜 이메일 추출 월별 상한 추적 — 현재 집계 중인 월(YYYYMM). NULL이면 이번 달 첫 처리 전. */
  free_email_month: string | null;
  /** 무료 플랜 이메일 추출 월별 상한 추적 — 해당 월의 처리 횟수. free_email_month가 현재 달이 아니면 만료된 값. */
  free_email_count: number;
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
  /** AI가 GENERAL 항목을 전자제품(A/S 보증이 중요한)으로 판단했을 때만 기본값(12)이 채워짐.
   *  그 외에는 NULL — 반품기한과 별개로 등록 화면에서 둘 다 프리필될 수 있게 한다. */
  warranty_months: number | null;
  /** RECURRING_DELIVERY/SUBSCRIPTION 전용: 배송·결제 주기(일수). INTERVAL 방식일 때만 의미 있음. */
  interval_days: number | null;
  schedule_type: ScheduleType;
  fixed_day_of_month: number | null;
  /** SQLite boolean(0/1) — true면 원본에 주기/고정일이 명시되지 않아 30일 기본값으로 추정한 값. */
  schedule_estimated: number;
  /** AI가 추출한 금액(원). 원본에 없으면 NULL. */
  amount: number | null;
  /** AI가 추정한 서비스 카테고리 — 모든 구매 유형에 적용. 판단 불가면 NULL. */
  category: PurchaseCategory | null;
  category_tags: string | null;
  /** 같은 상품명의 기존 활성 항목과 매칭됐고 금액이 달라졌을 때만 그 항목의 id. 그 외 NULL(가격 변동 없음/신규 항목). */
  matched_purchase_id: number | null;
  /** matched_purchase_id가 있을 때 그 항목의 "변경 전" 금액. 그 외 NULL. */
  previous_amount: number | null;
  /** 판매처/브랜드명. AI 이메일 추출 시 자동 감지. NULL이면 미감지. */
  brand: string | null;
  /** brand의 공식 도메인(로고 표시용). AI가 확신할 때만 채움. */
  brand_domain: string | null;
  /** 외화 결제 원본 금액(소수점 유지). 원화 결제면 NULL. */
  original_amount: number | null;
  /** 외화 결제 원본 통화 코드(ISO 4217). 원화 결제면 NULL. */
  original_currency: string | null;
  /** 결제일(order_date) 기준 적용 환율(1 original_currency = N KRW). 원화 결제면 NULL. */
  exchange_rate: number | null;
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
  /** AI가 GENERAL 항목을 전자제품으로 판단했을 때만 기본값(12)이 채워짐. 그 외 null. */
  warrantyMonths: number | null;
  intervalDays: number | null;
  scheduleType: ScheduleType;
  fixedDayOfMonth: number | null;
  scheduleEstimated: boolean;
  /** AI가 추출한 금액(원). 원본에 없으면 null. */
  amount: number | null;
  /** AI가 추정한 서비스 카테고리 — 모든 구매 유형에 적용. 판단 불가면 null. */
  category: PurchaseCategory | null;
  categoryTags: PurchaseCategory[];
  /** 같은 상품명의 기존 활성 항목과 매칭됐고 금액이 달라졌을 때만 그 항목의 id. 그 외 null(가격 변동 없음/신규 항목). */
  matchedPurchaseId: number | null;
  /** matchedPurchaseId가 있을 때 그 항목의 "변경 전" 금액. 그 외 null. */
  previousAmount: number | null;
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
  /** 정기 항목이지만 최초 1회만 사용. 목록은 유지하고 이후 지출·유지 확인만 제외한다. */
  isOneTime: boolean;
  /** GENERAL/RECURRING_DELIVERY 전용 도착(예정)일 앵커 — usesArrivalDate 참고. SUBSCRIPTION/미지정이면
   *  null(그런 경우 baseDate가 대신 앵커로 쓰인다). */
  expectedDeliveryDate: string | null;
  lastDeliveredDate: string | null;
  /** 도착 확인에서 "아직 안 받았어요"를 선택하면 다음 날로 설정되는 재질문 날짜. */
  arrivalCheckSnoozedUntil: string | null;
  /** "가장 급한" 기한 — GENERAL이고 반품기한/A·S보증 둘 다 있으면 그 중 더 이른(지나지 않았다면
   *  더 가까운, 둘 다 지났다면 덜 지난) 쪽. 카드 배지·정렬·CSV/PDF export가 쓰는 단일 기한. */
  deadline: string;
  dDay: number;
  /** RECURRING_DELIVERY 전용 — 몇 회차인지(1부터 시작). 그 외 타입은 null. */
  deliveryRound: number | null;
  /** 이력 보관(프리미엄) 시각. null이면 활성 항목. */
  archivedAt: string | null;
  /** "삭제"(취소와 다름) 시각. null이면 정상 — discard된 항목은 애초에 목록 조회에 안 잡히므로
   *  이 필드는 사실상 항상 null로 온다(스키마 완전성을 위해 남겨둠). */
  discardedAt: string | null;
  /** 서비스 카테고리 — 모든 구매 유형에 적용. 미지정이면 null. */
  category: PurchaseCategory | null;
  categoryTags: PurchaseCategory[];
  /** GENERAL이고 returnDeadlineDays가 있을 때만: baseDate + returnDeadlineDays. 그 외 null. */
  returnDeadlineDate: string | null;
  /** returnDeadlineDate의 D-day. returnDeadlineDate가 null이면 null. */
  returnDeadlineDDay: number | null;
  /** GENERAL이고 warrantyMonths가 있을 때만: baseDate + warrantyMonths. 그 외 null. */
  warrantyDeadlineDate: string | null;
  /** warrantyDeadlineDate의 D-day. warrantyDeadlineDate가 null이면 null. */
  warrantyDeadlineDDay: number | null;
  /** "유지하기"(이번 회차 확인)를 누른 누적 횟수 — 연속 미확인 회차 수 계산에 쓴다. */
  deliveryConfirmCount: number;
  /** 사용자가 "유지 안 함"을 누른 시각. null이면 미확인일 뿐(사용 안 함으로 해석 금지). */
  discontinuedAt: string | null;
  stopAfterCurrentAt: string | null;
  deadlineNotificationsDisabledAt: string | null;
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

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface NativePushTokenRow {
  id: number;
  user_id: number;
  token: string;
  created_at: string;
  updated_at: string;
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
  /** 네이티브 앱 전용 — 쿠키 없이 preferences에 저장해 세션을 복원하는 데 쓴다. */
  refreshToken?: string;
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
  isOneTime?: boolean;
  /** GENERAL/RECURRING_DELIVERY 전용 — usesArrivalDate 참고. SUBSCRIPTION이면 무시된다. */
  expectedDeliveryDate?: string | null;
  category?: PurchaseCategory | null;
  categoryTags?: PurchaseCategory[];
  brand?: string | null;
  brandDomain?: string | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  exchangeRate?: number | null;
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
  kakao_sid: string | null;
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
  pg_provider: 'TOSS' | 'KAKAOPAY';
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

// D1 row shape (snake_case columns from migrations/0014_add_feedback.sql,
// is_private added in 0029_add_feedback_private.sql)
export interface FeedbackRow {
  id: number;
  user_id: number;
  category: FeedbackCategory;
  title: string;
  content: string;
  status: FeedbackStatus;
  /** SQLite boolean(0/1) — 1이면 작성자 본인과 운영자만 상세를 볼 수 있다(목록엔 제목 마스킹돼서 계속 노출). */
  is_private: number;
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
  /** 비밀글이고 조회자가 작성자/운영자가 아니면 "🔒 비밀글입니다"로 마스킹된다. */
  title: string;
  status: FeedbackStatus;
  authorNickname: string;
  replyCount: number;
  isPrivate: boolean;
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
  isPrivate: boolean;
  createdAt: string;
  replies: FeedbackReplyResponse[];
}

export interface Env {
  DB: D1Database;
  AI: Ai;
  /** 안드로이드 APK 등 대용량 다운로드 파일 저장소 — Workers 정적 자산의 25MB 제한을 피하려고 둔다. */
  DOWNLOADS_BUCKET: R2Bucket;
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
  /**
   * 카카오페이 개발자센터에서 발급받는 Secret Key(dev/live) — 구 Admin Key 방식은 폐지되어
   * `Authorization: SECRET_KEY {값}` 헤더로 쓴다. 테스트 중에는 카카오페이가 공개한 테스트
   * CID(KAKAOPAY_CID=TC0ONETIME)와 함께 각자 발급받은 개발용 Secret Key(dev)를 쓰면 된다.
   */
  KAKAOPAY_SECRET_KEY: string;
  /** 단건결제 가맹점 코드. 심사 전 테스트 단계에서는 카카오페이 공개 테스트 CID `TC0ONETIME`을 쓴다. */
  KAKAOPAY_CID: string;
  /** 정기결제 가맹점 코드 — 단건과 별도로 발급된다. 심사 전 테스트 단계에서는 공개 테스트 CID `TCSUBSCRIP`을 쓴다. */
  KAKAOPAY_SUBSCRIPTION_CID: string;
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
  /**
   * Firebase 서비스 계정 JSON 문자열 — FCM HTTP v1 API 인증에 사용.
   * Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성.
   * 로컬은 .dev.vars, 배포본은 `wrangler secret put FIREBASE_SERVICE_ACCOUNT`로 관리.
   * 없으면 FCM 발송을 건너뛴다(로컬 개발 등).
   */
  FIREBASE_SERVICE_ACCOUNT?: string;
}

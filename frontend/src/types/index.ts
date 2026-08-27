import {
  isRecurringType as isSharedRecurringType,
  type SharedPurchaseType,
} from '../../../shared/domain-policy';

export type PurchaseType = SharedPurchaseType;
export type ScheduleType = 'INTERVAL' | 'FIXED_DAY';
/** 서비스 카테고리 — 모든 구매 유형에 적용된다(GENERAL 포함). */
export type PurchaseCategory = 'SOFTWARE' | 'AI' | 'ENTERTAINMENT' | 'SHOPPING' | 'FOOD' | 'HAIR_BODY' | 'SKINCARE' | 'PET' | 'ELECTRONICS' | 'CREATOR_SUPPORT' | 'CLOUD' | 'OTHER';

/** RECURRING_DELIVERY(실물 정기배송)와 SUBSCRIPTION(디지털 정기구독)은 라벨/색상만 다르고
 *  스케줄(다음 일정, 회차, 확인 버튼 등)은 완전히 동일하게 동작한다. */
export function isRecurringType(type: PurchaseType): boolean {
  return isSharedRecurringType(type);
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
  /** scheduleType=FIXED_DAY일 때 몇 달마다 반복되는지(1~6). 기본 1(매월) — 기존 동작과 동일. */
  fixedDayIntervalMonths: number;
  /** 정기 항목이지만 최초 1회만 사용. 목록은 유지하고 이후 지출·유지 확인만 제외한다. */
  isOneTime: boolean;
  /** RECURRING_DELIVERY 전용 스케줄 앵커("최초 도착(예정)일") — 없으면(null) baseDate가 대신 앵커로 쓰인다. */
  expectedDeliveryDate: string | null;
  /** RECURRING_DELIVERY 전용: 결제일로부터 보통 영업일 며칠 후 도착하는지(스케줄 계산 전용 —
   *  카드 표시엔 안 쓰인다). 미입력이면 null. */
  arrivalOffsetDays: number | null;
  /** RECURRING_DELIVERY 카드에 보여주는 참고용 도착 예상 범위 — 결제일 다음날~그다음날 기준
   *  (토요일은 배송일로 인정, 일요일·공휴일이면 하루씩 밈). arrivalOffsetDays 설정 여부와
   *  무관하게 항상 채워진다. 그 외 타입은 null. */
  arrivalRangeEstimate: { from: string; to: string } | null;
  lastDeliveredDate: string | null;
  /** GENERAL 외에는 항상 null — 도착 확인은 GENERAL 전용이다. */
  arrivalCheckSnoozedUntil: string | null;
  /** 정기구독·배송 유지 확인에 답한 회차의 deadline 값 — deadline과 같으면 이번 회차는 이미 답한 것. */
  renewalDecisionFor: string | null;
  /** "가장 급한" 기한 — GENERAL이고 반품기한/A·S보증 둘 다 있으면 더 급한 쪽. */
  deadline: string;
  /** 카드 배지 표시용 — 지금은 항상 paymentDDay와 같다. */
  dDay: number;
  /** 결제일(deadline) 기준 D-day. */
  paymentDDay: number;
  deliveryRound: number | null;
  archivedAt: string | null;
  /** "삭제"(취소와 다름) 시각. null이 아니면 "지난 항목" 탭 대상. */
  discardedAt: string | null;
  /** 마지막 갱신 시각 — "지난 항목" 탭 최신순 정렬에 쓴다. */
  updatedAt: string;
  category: PurchaseCategory | null;
  /** One order can contain products from several categories. category is the primary tag. */
  categoryTags: PurchaseCategory[];
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
  /** 재개가 완료된 중단 구간. 이 사이의 예정 회차는 지출에서 제외한다. */
  schedulePausePeriods?: { from: string; to: string }[];
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
  /** 서버가 계산한 트래블 카드 사용 시 예상 원화 금액. */
  travelCardAmount: number | null;
  /** "유지하기"로 회차가 갱신될 때 직전 회차 대비 금액이 달라졌으면 그 직전 금액. 변동 없거나
   *  아직 비교할 이전 회차가 없으면 null. 이메일 매칭 감지(PendingPurchase.previousAmount)와는
   *  별개 경로 — 카드 옆 인상/인하 화살표는 둘 중 하나라도 있으면 뜬다. */
  priceChangePreviousAmount: number | null;
  /** 회차별 확정 금액 이력 — 오래된 회차 순. GET /purchases?scope=spend 조회에서만 채워지고,
   *  그 외(카드 목록 등) 조회에서는 항상 빈 배열이다. */
  paymentHistory: { cycleDate: string; amount: number }[];
  createdAt: string;
  /** 정기배송·구독 전용 — 마지막 회차가 결제일로부터 1주일까지도 미확인 상태로 남아있으면
   *  true(서버 계산). isPastItem이 "지난 항목" 분류에 쓴다. */
  pastDueUnconfirmed: boolean;
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
  fixedDayIntervalMonths?: number;
  isOneTime?: boolean;
  /** RECURRING_DELIVERY 전용 — 스케줄 앵커. GENERAL은 정보용으로만 저장되고 계산엔 영향 없다. */
  expectedDeliveryDate?: string | null;
  /** RECURRING_DELIVERY 전용 — 결제일로부터 보통 영업일 며칠 후 도착하는지. */
  arrivalOffsetDays?: number | null;
  category?: PurchaseCategory | null;
  categoryTags?: PurchaseCategory[];
  brand?: string | null;
  brandDomain?: string | null;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  exchangeRate?: number | null;
  /** 재구독 연결 — 같은 이름의 "지난 항목" id를 넘기면 그 항목의 마지막 회차 다음 번호로 이
   *  새 항목의 회차가 이어진다. 신규 등록에서만 의미 있다. */
  linkedPastPurchaseId?: number | null;
}

export interface AuthResponse {
  accessToken: string;
  nickname: string;
  hasSeenOnboarding: boolean;
  /** 네이티브 앱 전용 — preferences에 저장해 쿠키 없이 세션 복원에 쓴다. */
  refreshToken?: string;
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
  /** scheduleType=FIXED_DAY일 때 몇 달마다 반복되는지(1~6). 기본 1(매월). */
  fixedDayIntervalMonths: number;
  /** true면 원본(이메일/이미지)에 주기·고정일이 명시되지 않아 30일 기본값으로 추정한 값. */
  scheduleEstimated: boolean;
  /** RECURRING_DELIVERY 전용: 서버가 orderDate/expectedDeliveryDate로부터 자동 계산한 결제→도착 영업일 오프셋. */
  arrivalOffsetDays: number | null;
  /** AI가 추출한 금액(원). 원본에 없으면 null. */
  amount: number | null;
  /** AI가 추정한 서비스 카테고리 — 모든 구매 유형에 적용. 판단 불가면 null. */
  category: PurchaseCategory | null;
  categoryTags: PurchaseCategory[];
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
  /** 같은 상품명의 기존 활성 항목과 매칭됐고 금액이 달라졌을 때만 그 항목의 id — "가격 변동 감지". 그 외 null. */
  matchedPurchaseId: number | null;
  /** matchedPurchaseId가 있을 때 그 항목의 변경 전 금액. 그 외 null. */
  previousAmount: number | null;
  /** 같은 상품명의 "지난 항목"이 있을 때만 그 항목의 id — 재구독 여부를 물어보는 용도. 그 외 null. */
  matchedPastPurchaseId: number | null;
  status: PendingPurchaseStatus;
  createdAt: string;
}

export interface PendingPurchasesResponse {
  forwardingEmail: string;
  items: PendingPurchase[];
}

export type SharedAccessStatus = 'pending' | 'accepted';

export interface SharedAccess {
  id: number;
  counterpart: string;
  status: SharedAccessStatus;
  createdAt: string;
}


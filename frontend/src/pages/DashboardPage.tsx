import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { confirmArrival, confirmArrivalBatch, confirmArrivalForPurchase, confirmRecurringBatch, snoozeArrivalForPurchase } from '../api/push';
import {
  fetchPurchases,
  fetchPurchasesForSpendHistory,
  createPurchase,
  updatePurchase,
  deletePurchase,
  discardPurchase,
  discardAllPurchases,
  markDelivered,
  confirmAllDelivered,
  discontinuePurchase,
  disableDeadlineNotifications,
  archivePurchase,
  unarchivePurchase,
  downloadExport,
  fetchAiSummary,
  type AiSummaryInput,
  type AiBriefSections,
} from '../api/purchases';
import { applyPriceChange, fetchPendingPurchases, confirmPendingPurchase, ignorePendingPurchase } from '../api/pendingPurchases';
import { completeOnboarding as apiCompleteOnboarding, fetchNotificationDays, regenerateForwardingAddress } from '../api/settings';
import { fetchReceivedInvites, fetchSharedPurchases } from '../api/sharing';
import {
  isRecurringType,
  type PendingPurchase,
  type Purchase,
  type PurchaseCategory,
  type PurchaseType,
  type ScheduleType,
  type SharedAccess,
} from '../types';
import { useAuth } from '../context/AuthContext';
import StampBadge from '../components/StampBadge';
import PremiumBadge from '../components/PremiumBadge';
import PushPermissionBanner from '../components/PushPermissionBanner';
import OnboardingOverlay from '../components/OnboardingOverlay';
import Pagination from '../components/Pagination';
import ArrivalCheckSection from '../components/dashboard/ArrivalCheckSection';
import BrandAvatar from '../components/dashboard/BrandAvatar';
import { formatOriginalAmount, FxHint, PurchaseAmount } from '../components/dashboard/PurchaseMoney';
import WeeklySummaryBanner from '../components/dashboard/WeeklySummaryBanner';
import {
  currentCalendarWeekRange,
  daysSinceBaseDate,
  formatKoreanMonthDay,
  formatShortDate,
  isWithinRecentDays,
  isWithinUpcomingDays,
  occurrenceDatesInMonth,
  occurrencesInMonth,
  previousFixedScheduleDate,
  shiftDateOnly,
  todayDateOnly,
  totalSpendInMonth,
} from '../components/dashboard/dashboardUtils';

const PURCHASES_PAGE_SIZE = 5;

/** 원화 입력값은 화면에서 천 단위로 구분하고, 저장할 때는 쉼표를 제외한 숫자를 사용한다. */
function formatAmountInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}

function parseAmountInput(value: string): number | undefined {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

interface AiBriefData extends AiBriefSections {
  month: number;
  monthlySpend: number;
  yearlySpend: number;
  totalRecurring: number;
  topCategory: string | null;
  topCategoryAmount: number | null;
  trendPct: number | null;
  reviewCount: number;
  /**
   * 다음 결제/배송 예정일과 그 항목명. AI(LLM)가 아니라 실제 데이터에서 직접 계산한 결정론적
   * 사실이라 100% 정확하다 — 날짜·이름은 모델이 지어내면 안 되는 값이라 여기서 채운다.
   */
  nextPaymentDate: string | null;
  nextPaymentItem: string | null;
  /** 확인 대기 목록에서 가격 인상이 감지된 항목명 목록. 마찬가지로 결정론적 계산값. */
  priceIncreaseItems: string[];
  /** "유지 안 함" 표시했거나 3회차 이상 미확인인 구독/정기배송 항목명 목록(절약 후보). */
  unusedServiceItems: string[];
  /** 다음 결제까지 남은 일수(오늘 기준 D-day). 없으면 null. */
  nextPaymentDDay: number | null;
  /** 사용 안 함 의심 항목들의 월 환산 절약 가능 금액 합계. */
  savingsEstimate: number;
  /**
   * 위 신호들(가격 인상·미사용 의심·지출 추이·과다구독)을 점수화한 결정론적 지수(0~100) —
   * AI가 매기는 게 아니라 규칙 기반 계산이다. "AI 소비 건강도"라는 이름으로 보여주지만
   * 실제로는 이미 계산해둔 값들을 하나의 지표로 압축한 것뿐이라 매번 똑같은 입력엔 항상
   * 같은 점수가 나온다(모델 호출 없이 재현 가능).
   */
  healthScore: number;
}

const TYPE_LABEL: Record<PurchaseType, string> = {
  GENERAL: '일반 구매',
  RECURRING_DELIVERY: '정기배송',
  SUBSCRIPTION: '정기구독',
};

/** 비-recurring(GENERAL) 카드는 renderGeneralDeadlineLines가 반품기한/A·S보증을 각각 따로
 *  보여주므로 이 라벨은 실제로 쓰이지 않는다 — 타입 완전성을 위한 안전망 값. */
const DEADLINE_LABEL: Record<PurchaseType, string> = {
  GENERAL: '기한',
  RECURRING_DELIVERY: '다음 일정',
  SUBSCRIPTION: '다음 일정',
};

const TYPE_SHORT_LABEL: Record<PurchaseType, string> = {
  GENERAL: '일반구매',
  RECURRING_DELIVERY: '정기배송',
  SUBSCRIPTION: '정기구독',
};

const PURCHASE_TYPES: PurchaseType[] = ['GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION'];

/** 서비스 카테고리 — 이제 모든 구매 유형에 적용된다. "카테고리별 분석" 보드에서 이 순서대로 노출한다. */
const PURCHASE_CATEGORIES: PurchaseCategory[] = ['SOFTWARE', 'AI', 'ENTERTAINMENT', 'SHOPPING', 'FOOD', 'HAIR_BODY', 'SKINCARE', 'PET', 'ELECTRONICS', 'CREATOR_SUPPORT', 'CLOUD', 'OTHER'];

const CATEGORY_LABEL: Record<PurchaseCategory, string> = {
  SOFTWARE: '소프트웨어',
  AI: 'AI',
  ENTERTAINMENT: '엔터테인먼트',
  SHOPPING: '쇼핑',
  FOOD: '식품',
  HAIR_BODY: '헤어/바디',
  SKINCARE: '스킨케어',
  PET: '반려동물',
  ELECTRONICS: '전자제품',
  CREATOR_SUPPORT: '크리에이터 후원',
  CLOUD: '클라우드',
  OTHER: '기타',
};

const CATEGORY_ICON: Record<PurchaseCategory, string> = {
  SOFTWARE: '💻',
  AI: '🤖',
  ENTERTAINMENT: '🎬',
  SHOPPING: '🛒',
  FOOD: '🍽️',
  HAIR_BODY: '🧴',
  SKINCARE: '✨',
  PET: '🐾',
  ELECTRONICS: '🔌',
  CREATOR_SUPPORT: '💝',
  CLOUD: '☁️',
  OTHER: '📦',
};

type FilterType = 'ALL' | PurchaseType;

/** 목록 위 필터 메뉴 — 종류별 배지/점 색과 동일한 팔레트를 쓰지만 라벨은 사용자가 목록을 훑을 때 더 와닿는 실용적인 표현으로 따로 둔다. */
const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'GENERAL', label: '일반구매' },
  { key: 'RECURRING_DELIVERY', label: '정기배송' },
  { key: 'SUBSCRIPTION', label: '정기구독' },
];

/** "7일 이내" 배너와 동일한 기준 — 이 안으로 들어오면 다시 챙길 때가 된 것으로 본다. */
const URGENT_WINDOW_DAYS = 7;

/**
 * "확인 필요"/"AI 절약 제안" 판정에 쓰는 연속 미확인 회차 임계값 — 이만큼 "유지하기"를 안 누르고
 * 회차가 지나면 절약 후보(빨간 신호)로 취급한다. 1~2회차 미확인은 "확인 필요"(노란 신호)로만
 * 다루고 아직 절약 후보로 올리지 않는다.
 *
 * 주의: purchase-logic.ts에는 예전에 "회차 수 vs delivery_confirm_count" 비교로 "놓친 배송"을
 * 판정하던 computeMissedConfirmations가 있었는데, 실제 배송 지연/버튼을 늦게 누르는 경우가 흔해
 * 오탐이 잦아서 완전히 제거됐다(CLAUDE.md 참고). 여기서 하는 건 그것과 계산식은 비슷하지만
 * 목적이 다르다 — "배송이 안 됐다"를 단정하는 게 아니라 "혹시 안 쓰고 있을 수도 있으니 확인해
 * 달라"는 참고용 추천일 뿐이고, 미확인을 절대 "사용 안 함"으로 단정하지 않는다(discontinuedAt이
 * 명시적으로 찍힌 경우만 확정). 그 교훈을 반영해 라벨도 항상 "확인이 필요합니다"류로 순화한다.
 */
const MISSED_ROUNDS_REVIEW_THRESHOLD = 3;

/** 무료 플랜(isPremium=false) 최대 등록 개수 — 백엔드 purchase-logic.ts의 FREE_PLAN_MAX_PURCHASES와 값을 맞춘다. */
const FREE_PLAN_MAX_PURCHASES = 5;

/**
 * 정기구독·배송이고 오늘 이미 "유지하기"를 눌렀는지. (예전에는 계산상 회차 수와
 * delivery_confirm_count를 비교해서 "놓친 배송"까지 판단했지만, 실제 배송 지연 등으로 오탐이
 * 잦아 그 비교 로직 자체를 제거했다 — 지금은 "오늘 확인 버튼을 눌렀는가"만 본다.)
 */
function isFullyConfirmed(p: Purchase): boolean {
  return isRecurringType(p.type) && p.lastDeliveredDate === todayDateOnly();
}

/**
 * GENERAL 카드의 기한 표시 — 반품기한/A·S보증 둘 다 있으면 두 줄, 하나만 있으면 한 줄만
 * 렌더링한다(둘 다 없는 경우는 이론상 없음 — computeDeadlines의 안전망 참고).
 */
function renderGeneralDeadlineLines(p: Purchase) {
  return (
    <>
      {p.returnDeadlineDate && (
        <p className="ticket-card__deadline">
          반품기한 · <span className="mono">{p.returnDeadlineDate}</span>
        </p>
      )}
      {p.warrantyDeadlineDate && (
        <p className="ticket-card__deadline">
          A/S 보증만료 · <span className="mono">{p.warrantyDeadlineDate}</span>
        </p>
      )}
    </>
  );
}

/** urgent 배너처럼 "기한 1개"만 보여줄 수 있는 곳에서 p.deadline(soonest/primary)이 반품기한과
 *  A/S보증 중 어느 쪽인지 라벨링한다. */
function primaryDeadlineLabel(p: Purchase): string {
  if (isRecurringType(p.type)) return '다음 일정';
  if (p.deadline === p.warrantyDeadlineDate && p.deadline !== p.returnDeadlineDate) return 'A/S 보증만료';
  return '반품기한';
}

/** 종류 배지 옆에 붙는 서비스 카테고리 배지 — category가 없으면 아무것도 표시하지 않는다. */
function renderCategoryBadge(p: Purchase) {
  const tags = p.categoryTags.length > 0 ? p.categoryTags : p.category ? [p.category] : [];
  if (tags.length === 0) return null;
  return tags.map((category) => (
    <span className={`ticket-card__category ticket-card__category--${category}`} key={category}>
      {CATEGORY_ICON[category]} {CATEGORY_LABEL[category]}
    </span>
  ));
}

/**
 * "정기배송"/"정기구독" 요약 타일 상세용 — 날짜순이 아니라 서비스 카테고리별로 묶어서
 * 한눈에 보여준다(같은 유형·같은 서비스끼리 정렬). 그룹 내부는 dDay 오름차순.
 * category가 null인 항목은 마지막에 'UNCATEGORIZED' 그룹으로 묶인다.
 */
function groupByCategory(items: Purchase[]): { category: PurchaseCategory | 'UNCATEGORIZED'; items: Purchase[] }[] {
  const groups = PURCHASE_CATEGORIES.map((cat) => ({
    category: cat as PurchaseCategory | 'UNCATEGORIZED',
    items: items.filter((p) => p.category === cat).sort((a, b) => a.dDay - b.dDay),
  })).filter((g) => g.items.length > 0);

  const uncategorized = items.filter((p) => p.category === null).sort((a, b) => a.dDay - b.dDay);
  if (uncategorized.length > 0) groups.push({ category: 'UNCATEGORIZED', items: uncategorized });

  return groups;
}

/**
 * 이 항목이 연속 몇 회차째 "유지하기"가 안 눌린 채로 지나갔는지 — 정확한 회차별 이력을 저장하진
 * 않지만(deliveryConfirmCount는 누적 총합일 뿐), "지금까지 확인 기회가 있었던 회차 수 - 실제
 * 확인한 횟수"로 근사한다. dDay>0(아직 이번 회차 기한 전)이면 이번 회차는 아직 확인 기회가
 * 안 왔다고 보고 이전 회차까지만 센다.
 */
function missedRoundsFor(p: Purchase): number {
  if (!isRecurringType(p.type) || p.deliveryRound === null) return 0;
  const confirmableRounds = p.dDay <= 0 ? p.deliveryRound : p.deliveryRound - 1;
  return Math.max(0, confirmableRounds - p.deliveryConfirmCount);
}

/**
 * "지난 항목" 판정 — GENERAL은 dDay<0(반품기한·A/S보증 다 지남)이면 해당된다. 정기배송/구독은
 * computeDeadline이 매일 오늘 기준으로 다음 회차를 다시 계산해서 dDay가 사실상 음수로 남지
 * 않으므로(자동으로 다음 회차로 넘어감), dDay만으로는 "갱신 안 됨"을 못 잡아낸다 —
 * discontinuedAt("유지 안 함")이 유일하게 믿을 수 있는 신호다.
 */
function isOverdue(p: Purchase): boolean {
  // 한 번만 사용한 정기 항목은 완료 뒤에도 목록에 남기는 선택이다. 과거 일정이라는 이유만으로
  // "지난 항목"으로 보내면 이 옵션의 목적과 어긋난다.
  return (!isRecurringType(p.type) && p.dDay < 0) || (isRecurringType(p.type) && !p.isOneTime && p.discontinuedAt !== null);
}

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  /** 월별/연간 지출 집계 전용(활성+보관+삭제 전부 포함) — 카드로 렌더링하지 않는다. */
  const [spendHistoryPurchases, setSpendHistoryPurchases] = useState<Purchase[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [type, setType] = useState<PurchaseType>('GENERAL');
  const [itemName, setItemName] = useState('');
  const [baseDate, setBaseDate] = useState('');
  /** RECURRING_DELIVERY 전용 스케줄 앵커("최초 도착(예정)일") — 비워두면 baseDate가 대신 앵커로
   *  쓰인다(서버 fallback). GENERAL도 입력 가능하지만 정보용일 뿐 계산에 영향 없다. */
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [amount, setAmount] = useState('');
  /** GENERAL 전용 — 체크하면 A/S 보증(개월) 필드가 추가로 노출되고 반품기한과 함께 등록된다. */
  const [isElectronics, setIsElectronics] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [returnDeadlineDays, setReturnDeadlineDays] = useState('7');
  const [intervalDays, setIntervalDays] = useState('30');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('INTERVAL');
  const [fixedDayOfMonth, setFixedDayOfMonth] = useState('1');
  const [isOneTime, setIsOneTime] = useState(false);
  const [category, setCategory] = useState<PurchaseCategory>('OTHER');
  const [categoryTags, setCategoryTags] = useState<PurchaseCategory[]>(['OTHER']);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [forwardingEmail, setForwardingEmail] = useState('');
  const [pendingItems, setPendingItems] = useState<PendingPurchase[]>([]);
  const [pendingConfirmId, setPendingConfirmId] = useState<number | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [confirmAllMessage, setConfirmAllMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  /** 종류 필터가 'ALL'이 아닐 때만 노출되는 2차 필터 — 'UNCATEGORIZED'는 category가 null인 항목. */
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'UNCATEGORIZED' | PurchaseCategory>('ALL');
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [view, setView] = useState<'ACTIVE' | 'OVERDUE' | 'ARCHIVED' | 'SHARED'>('ACTIVE');
  const [archivedPurchases, setArchivedPurchases] = useState<Purchase[]>([]);
  const [acceptedShares, setAcceptedShares] = useState<SharedAccess[]>([]);
  const [selectedShareId, setSelectedShareId] = useState<number | null>(null);
  const [sharedPurchases, setSharedPurchases] = useState<Purchase[]>([]);
  const [exporting, setExporting] = useState(false);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [deadlineNotificationsEnabled, setDeadlineNotificationsEnabled] = useState<boolean | null>(null);
  const [showSpendingDetail, setShowSpendingDetail] = useState(false);
  const [aiBrief, setAiBrief] = useState<AiBriefData | null>(null);
  const [aiBriefTextLoading, setAiBriefTextLoading] = useState(false);
  const aiSummaryInFlightRef = useRef(false);
  const [brand, setBrand] = useState('');
  const [brandDomain, setBrandDomain] = useState<string | null>(null);
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);
  const [originalCurrency, setOriginalCurrency] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [showYearlyDetail, setShowYearlyDetail] = useState(false);
  const [showSavingsDetail, setShowSavingsDetail] = useState(false);
  const [showSpecificSpendCalculator, setShowSpecificSpendCalculator] = useState(false);
  /** 카테고리를 고르지 않으면 전체 범위를 보여 주되, 계산할 항목은 기본으로 선택하지 않는다. */
  const [calculatorType, setCalculatorType] = useState<FilterType>('ALL');
  const [calculatorCategories, setCalculatorCategories] = useState<PurchaseCategory[]>([]);
  const [calculatorSelectedItemIds, setCalculatorSelectedItemIds] = useState<number[]>([]);
  const [showPriceStatusDetail, setShowPriceStatusDetail] = useState(false);
  const [showRecurringDeliveryDetail, setShowRecurringDeliveryDetail] = useState(false);
  const [showSubscriptionDetail, setShowSubscriptionDetail] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const { nickname, isPremium, premiumSince, paymentCount, hasSeenOnboarding, completeOnboarding } = useAuth();
  const itemNameInputRef = useRef<HTMLInputElement>(null);

  // "오늘 주문하신 물건이 오셨나요?" 푸시 알림의 "받았어요"를 탭하면 대시보드가
  // ?confirmArrival=<토큰>으로 열린다(arrival-confirm.ts) — 액션 버튼 하나로 끝낼 수 없는
  // "며칠 전에 받았는지" 후속 질문을 여기 모달로 띄운다.
  const [searchParams, setSearchParams] = useSearchParams();
  const confirmArrivalToken = searchParams.get('confirmArrival');
  const confirmArrivalBatchToken = searchParams.get('confirmArrivalBatch');
  const confirmArrivalBatchIds = (searchParams.get('confirmArrivalItems') ?? '')
    .split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
  const confirmRecurringBatchToken = searchParams.get('confirmRecurringBatch');
  const confirmRecurringIds = (searchParams.get('confirmRecurring') ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  const [arrivalConfirmSubmitting, setArrivalConfirmSubmitting] = useState(false);
  const [arrivalConfirmError, setArrivalConfirmError] = useState<string | null>(null);
  const [arrivalConfirmDone, setArrivalConfirmDone] = useState(false);
  const [dashboardArrivalSubmittingId, setDashboardArrivalSubmittingId] = useState<number | null>(null);
  const [dashboardArrivalDaysAgo, setDashboardArrivalDaysAgo] = useState<Record<number, number>>({});
  const [confirmedRecurringIds, setConfirmedRecurringIds] = useState<number[]>([]);
  const [arrivalBatchReceived, setArrivalBatchReceived] = useState<{ id: number; daysAgo: number }[]>([]);
  const [recurringBatchMaintainedIds, setRecurringBatchMaintainedIds] = useState<number[]>([]);

  useEffect(() => {
    setArrivalBatchReceived(confirmArrivalBatchIds.map((id) => ({ id, daysAgo: 0 })));
  }, [confirmArrivalBatchToken, confirmArrivalBatchIds.join(',')]);
  useEffect(() => {
    setRecurringBatchMaintainedIds(confirmRecurringIds);
  }, [confirmRecurringBatchToken, confirmRecurringIds.join(',')]);

  const cacheKey = `purchases_cache_${nickname ?? 'anon'}`;

  const load = async () => {
    // 캐시 데이터 즉시 표시 (stale-while-revalidate)
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        setPurchases(JSON.parse(raw) as Purchase[]);
        setPurchasesLoaded(true);
      }
    } catch {}
    // 항상 서버에서 최신 데이터 fetch
    const data = await fetchPurchases();
    setPurchases(data);
    setPurchasesLoaded(true);
    try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
  };

  const loadSpendHistory = async () => {
    const data = await fetchPurchasesForSpendHistory();
    setSpendHistoryPurchases(data);
  };

  const loadPending = async () => {
    const data = await fetchPendingPurchases();
    setForwardingEmail(data.forwardingEmail);
    setPendingItems(data.items);
  };

  /**
   * 등록/수정 응답으로 이미 받은 최신 Purchase를 캐시·상태에 바로 반영한다 — 등록·수정 직후
   * load()/loadSpendHistory()로 목록 전체를 다시 GET하지 않아도 되게 해서(서버가 이미 정확한
   * 값을 돌려줬으니 다시 물어볼 필요가 없다) 등록 체감 속도를 올린다. 새 항목이면 추가 후
   * dDay 기준으로 재정렬(서버 목록 조회와 같은 정렬 규칙), 기존 항목이면 해당 id만 교체한다.
   */
  const applyPurchaseUpsert = (purchase: Purchase) => {
    setPurchases((prev) => {
      const exists = prev.some((p) => p.id === purchase.id);
      const next = (exists ? prev.map((p) => (p.id === purchase.id ? purchase : p)) : [...prev, purchase]).sort(
        (a, b) => a.dDay - b.dDay
      );
      try {
        localStorage.setItem(cacheKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    setSpendHistoryPurchases((prev) =>
      prev.some((p) => p.id === purchase.id) ? prev.map((p) => (p.id === purchase.id ? purchase : p)) : [...prev, purchase]
    );
  };

  const loadArchived = async () => {
    const data = await fetchPurchases({ archived: true });
    setArchivedPurchases(data);
  };

  const loadAcceptedShares = async () => {
    const invites = await fetchReceivedInvites();
    const accepted = invites.filter((i) => i.status === 'accepted');
    setAcceptedShares(accepted);
    return accepted;
  };

  useEffect(() => {
    load();
    loadSpendHistory();
    loadPending();
    loadAcceptedShares();
    fetchNotificationDays()
      .then((data) => setDeadlineNotificationsEnabled(data.notificationDays.length > 0))
      .catch(() => setDeadlineNotificationsEnabled(true));
  }, []);

  // 메일 자동화 주소로 들어온 항목은 서버에서 비동기로 만들어진다. 대시보드를 이미 열어 둔
  // 사용자도 새로고침할 필요 없이 볼 수 있도록 주기적으로 갱신하고, 앱으로 돌아올 때는 즉시
  // 다시 조회한다.
  useEffect(() => {
    const refreshPending = () => {
      void loadPending().catch((err) => console.error('확인 대기 목록 갱신 실패', err));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshPending();
    };

    const intervalId = window.setInterval(refreshPending, 30_000);
    window.addEventListener('focus', refreshPending);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshPending);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (view === 'ARCHIVED') loadArchived();
  }, [view]);

  const handleAiSummary = () => {
    if (aiSummaryInFlightRef.current) return;
    aiSummaryInFlightRef.current = true;
    const today = todayDateOnly();
    const [yr, mo] = today.split('-').map(Number);
    // "한 번만 사용"은 해당 구독의 첫 달까지 관리 대상이므로 포함한다. 다만 "유지 안 함"은
    // 다음 갱신부터 중단된 상태라 구독 수·AI 분석 대상에서 제외한다.
    const rcCount = purchases.filter((p) => p.type === 'RECURRING_DELIVERY' && p.discontinuedAt === null).length;
    const subCount = purchases.filter((p) => p.type === 'SUBSCRIPTION' && p.discontinuedAt === null).length;
    const totalRecurring = rcCount + subCount;
    // 요약 카드와 AI 소비 매니저의 수치가 달라지지 않도록, 일반 구매와 정기 항목을 포함하는
    // 대시보드의 월별 지출 계산(totalSpendInMonth)을 그대로 사용한다.
    const moSpend = totalSpendInMonth(spendHistoryPurchases, yr, mo);
    const yrSpend = Array.from({ length: 12 }, (_, i) =>
      totalSpendInMonth(spendHistoryPurchases, yr, i + 1),
    ).reduce((a, b) => a + b, 0);
    const prevMoSpend = totalSpendInMonth(spendHistoryPurchases, mo === 1 ? yr - 1 : yr, mo === 1 ? 12 : mo - 1);
    const trendPct = prevMoSpend > 0 ? Math.round(((moSpend - prevMoSpend) / prevMoSpend) * 100) : null;

    const catAmounts = PURCHASE_CATEGORIES.map((cat) => {
      const total = spendHistoryPurchases
        .filter((p) => p.category === cat && p.amount !== null)
        .reduce((sum, p) => {
          if (isRecurringType(p.type)) return sum + occurrencesInMonth(p, yr, mo) * p.amount!;
          const [baseYear, baseMonth] = p.baseDate.split('-').map(Number);
          return baseYear === yr && baseMonth === mo ? sum + p.amount! : sum;
        }, 0);
      return { cat, total: Math.round(total) };
    }).filter((c) => c.total > 0);
    const topCat = catAmounts.sort((a, b) => b.total - a.total)[0] ?? null;

    // reviewCandidates(컴포넌트 상단, 절약 후보 확정 기준)를 그대로 재사용 — 기준이 어긋나지 않게.
    const reviewCount = reviewCandidates.length;

    const topCatLabel = topCat ? CATEGORY_LABEL[topCat.cat] : null;

    // 다음 결제/배송(가장 가까운 dDay의 정기배송·구독) — AI가 아니라 실제 데이터로 직접 계산한다
    // (날짜·이름은 모델이 지어내면 안 되는 값이라서). 가격 인상/사용 안 함 항목은 "가격 인상" 타일의
    // 3분류 계산(priceUpItems/unusedItems, 컴포넌트 상단에서 이미 계산됨)을 그대로 재사용한다.
    const upcoming = purchases
      // 한 번만 사용하는 항목과 이미 "유지 안 함"으로 끝낸 항목은 자동 결제를
      // 확인할 대상이 아니다. 목록에는 이력을 위해 남아도 소비 매니저의 다음
      // 확인 서비스 후보에는 넣지 않는다.
      .filter((p) => isRecurringType(p.type) && !p.isOneTime && p.discontinuedAt === null)
      .sort((a, b) => a.dDay - b.dDay)[0] ?? null;
    const priceIncreaseItems = priceUpItems.map((p) => p.itemName);
    const unusedServiceItems = unusedItems.map((p) => p.itemName);

    // "AI 소비 건강도" — 실제로는 AI가 아니라 위 신호들을 규칙 기반으로 점수화한 결정론적 지수.
    // 100점에서 시작해 가격 인상·미사용 의심·급격한 지출 증가·과다구독일 때 깎는다.
    let healthScore = 100;
    healthScore -= Math.min(priceUpItems.length * 15, 30);
    healthScore -= Math.min(unusedItems.length * 15, 30);
    if (trendPct !== null && trendPct >= 50) healthScore -= 20;
    else if (trendPct !== null && trendPct >= 20) healthScore -= 10;
    if (totalRecurring >= 15) healthScore -= 10;
    else if (totalRecurring >= 10) healthScore -= 5;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Show card with metrics immediately, text sections loading
    setAiBrief({
      month: mo,
      monthlySpend: Math.round(moSpend),
      yearlySpend: Math.round(yrSpend),
      totalRecurring,
      topCategory: topCatLabel,
      topCategoryAmount: topCat?.total ?? null,
      nextPaymentDate: upcoming?.deadline ?? null,
      nextPaymentItem: upcoming?.itemName ?? null,
      nextPaymentDDay: upcoming?.dDay ?? null,
      priceIncreaseItems,
      unusedServiceItems,
      savingsEstimate,
      healthScore,
      trendPct,
      reviewCount,
      goodNews: null,
      attention: null,
      insight: null,
    });
    setAiBriefTextLoading(true);

    const fmtWon = (n: number) => n.toLocaleString('ko-KR');

    const buildFallback = (): AiBriefSections => {
      let goodNews: string;
      if (totalRecurring === 0) goodNews = '아직 정기 구독이 등록되어 있지 않습니다.';
      else if (trendPct !== null && trendPct <= -10)
        goodNews = `전월 대비 ${Math.abs(trendPct)}% 줄어 ${fmtWon(Math.round(moSpend))}원이 예상됩니다. 잘 관리하고 있어요!`;
      else if (Math.round(moSpend) < 30000)
        goodNews = `${mo}월 예상 지출은 ${fmtWon(Math.round(moSpend))}원으로 부담이 크지 않습니다.`;
      else if (totalRecurring <= 3)
        goodNews = `${totalRecurring}개의 구독을 관리 중으로 현재 관리하기 쉬운 상태입니다.`;
      else goodNews = `${mo}월 예상 지출은 ${fmtWon(Math.round(moSpend))}원입니다.`;

      // 좋은소식과 나란히 "2개"로 항상 보여주기로 했으니, 특별히 우려되는 점이 없어도
      // 마지막 else에서 참고용 문구를 채워 null이 되지 않게 한다.
      let attention: string;
      if (reviewCount > 0) {
        const perItem = totalRecurring > 0 ? Math.round(moSpend / totalRecurring) : 0;
        const savingEst = perItem * reviewCount * 12;
        attention = `최근 수령 확인이 없는 구독이 ${reviewCount}개 있습니다. 해지하면 연간 약 ${fmtWon(savingEst)}원 절약 가능.`;
      } else if (trendPct !== null && trendPct >= 20) {
        attention = `이번 달 지출이 전월 대비 ${trendPct}% 늘었습니다. 새로 추가된 구독을 확인해보세요.`;
      } else if (totalRecurring >= 10) {
        attention = `현재 ${totalRecurring}개의 구독이 활성화되어 있습니다. 주기적으로 점검해보세요.`;
      } else {
        attention = '특별히 우려되는 점은 없습니다. 그래도 주기적으로 구독 현황을 점검해보세요.';
      }

      let insight: string;
      if (totalRecurring === 0) insight = '구독을 추가하면 월별 지출 추이와 갱신일을 자동으로 추적해드릴게요.';
      else if (reviewCount > 0) insight = '미사용 구독을 정리하면 연간 지출을 의미 있게 줄일 수 있어요.';
      else if (trendPct !== null && trendPct > 10) insight = '지출이 늘고 있어요. 최근 추가한 구독이 있는지 확인해보세요.';
      else if (trendPct !== null && trendPct < -10) insight = '지출이 줄고 있어요. 현재 소비 패턴을 유지하면 좋겠어요.';
      else insight = '이번 달 지출 패턴은 안정적입니다.';

      return { goodNews, attention, insight };
    };

    const input: AiSummaryInput = {
      month: mo,
      recurringDeliveryCount: rcCount,
      subscriptionCount: subCount,
      monthlySpend: Math.round(moSpend),
      yearlySpend: Math.round(yrSpend),
      monthTrendPercent: trendPct,
      topCategory: topCatLabel,
      topCategoryAmount: topCat?.total ?? null,
      topCategoryShare: topCat && moSpend > 0 ? Math.round((topCat.total / moSpend) * 100) : null,
      reviewCount,
      totalItems: purchases.length,
      nextPaymentDate: upcoming?.deadline ?? null,
      nextPaymentItem: upcoming?.itemName ?? null,
      priceIncreaseItems,
    };

    fetchAiSummary(input)
      .then((sections) => {
        const resolved: AiBriefSections =
          sections.goodNews || sections.insight
            ? sections
            : buildFallback();
        setAiBrief((prev) => (prev ? { ...prev, ...resolved } : prev));
      })
      .catch(() => {
        setAiBrief((prev) => (prev ? { ...prev, ...buildFallback() } : prev));
      })
      .finally(() => {
        aiSummaryInFlightRef.current = false;
        setAiBriefTextLoading(false);
      });
  };

  useEffect(() => {
    if (view === 'SHARED' && selectedShareId !== null) {
      fetchSharedPurchases(selectedShareId).then(setSharedPurchases);
    }
  }, [view, selectedShareId]);

  const handleSelectSharedView = async () => {
    setView('SHARED');
    if (selectedShareId === null) {
      const accepted = acceptedShares.length > 0 ? acceptedShares : await loadAcceptedShares();
      if (accepted.length > 0) setSelectedShareId(accepted[0].id);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setPendingConfirmId(null);
    setType('GENERAL');
    setItemName('');
    setBaseDate('');
    setExpectedDeliveryDate('');
    setAmount('');
    setIsElectronics(false);
    setWarrantyMonths('12');
    setReturnDeadlineDays('7');
    setIntervalDays('30');
    setScheduleType('INTERVAL');
    setFixedDayOfMonth('1');
    setIsOneTime(false);
    setCategory('OTHER');
    setCategoryTags(['OTHER']);
    setBrand('');
    setBrandDomain(null);
    setOriginalAmount(null);
    setOriginalCurrency(null);
    setExchangeRate(null);
    setShowRegisterForm(false);
  };

  const handleEditClick = (p: Purchase) => {
    setErrorMessage(null);
    setShowRegisterForm(true);
    setEditingId(p.id);
    setType(p.type);
    setItemName(p.itemName);
    setBaseDate(p.baseDate);
    setExpectedDeliveryDate(p.expectedDeliveryDate ?? '');
    setAmount(p.amount !== null ? formatAmountInput(String(p.amount)) : '');
    setIsElectronics(p.warrantyMonths !== null);
    setWarrantyMonths(String(p.warrantyMonths ?? 12));
    setReturnDeadlineDays(String(p.returnDeadlineDays ?? 7));
    setIntervalDays(String(p.intervalDays ?? 30));
    setScheduleType(p.scheduleType ?? 'INTERVAL');
    setFixedDayOfMonth(String(p.fixedDayOfMonth ?? 1));
    setIsOneTime(p.isOneTime);
    setCategory(p.category ?? 'OTHER');
    setCategoryTags(p.categoryTags.length > 0 ? p.categoryTags : [p.category ?? 'OTHER']);
    setBrand(p.brand ?? '');
    setBrandDomain(p.brandDomain ?? null);
    setOriginalAmount(p.originalAmount ?? null);
    setOriginalCurrency(p.originalCurrency ?? null);
    setExchangeRate(p.exchangeRate ?? null);
  };

  const handleCancelEdit = () => {
    setErrorMessage(null);
    resetForm();
  };

  /**
   * 확인 대기 항목 하나를 등록 폼에 프리필한다 — AI가 추정한 종류(type)를 그대로 프리필하되,
   * 폼 자체가 이미 종류를 자유롭게 바꿀 수 있고 종류에 맞는 입력 필드로 전환되므로 별도 UI 없이
   * "등록 전 확인 단계에서 종류까지 수정 가능"이 자연스럽게 충족된다.
   */
  const handlePendingRegisterClick = (item: PendingPurchase) => {
    setErrorMessage(null);
    resetForm();
    setShowRegisterForm(true);
    setType(item.type);
    setItemName(item.itemName ?? '');
    setAmount(item.amount !== null ? formatAmountInput(String(item.amount)) : '');
    if (isRecurringType(item.type)) {
      // baseDate("구매일")는 항상 이미 벌어진 기준일이어야 이번 달 지출 계산이 맞는다 —
      // orderDate(이번 결제/신청이 실제로 일어난 날)를 우선하고, 그게 없을 때만 미래 예정일인
      // expectedDeliveryDate로 대체한다.
      setBaseDate(item.orderDate ?? item.expectedDeliveryDate ?? '');
      // RECURRING_DELIVERY만 별도 스케줄 앵커를 쓴다 — AI가 추출한(또는 사용자가 메일에 직접
      // 적어 넣은) "첫 배송 예정일"을 그대로 프리필한다. SUBSCRIPTION은 baseDate 하나로 충분하다.
      if (item.type === 'RECURRING_DELIVERY') {
        setExpectedDeliveryDate(item.expectedDeliveryDate ?? '');
      }
      const st = item.scheduleType ?? 'INTERVAL';
      setScheduleType(st);
      if (st === 'FIXED_DAY' && item.fixedDayOfMonth !== null) {
        setFixedDayOfMonth(String(item.fixedDayOfMonth));
      } else if (item.intervalDays !== null) {
        setIntervalDays(String(item.intervalDays));
      }
      setCategory(item.category ?? 'OTHER');
      setCategoryTags(item.categoryTags.length > 0 ? item.categoryTags : [item.category ?? 'OTHER']);
    } else {
      setBaseDate(item.orderDate ?? item.expectedDeliveryDate ?? '');
      // GENERAL도 도착일을 정보용으로 같이 프리필한다(계산엔 영향 없음).
      setExpectedDeliveryDate(item.expectedDeliveryDate ?? '');
      if (item.returnDeadlineDays !== null) setReturnDeadlineDays(String(item.returnDeadlineDays));
      // AI가 전자제품으로 감지했으면(looksLikeElectronics) 반품기한과 별개로 A/S 보증기간도
      // 같이 프리필한다 — "전자제품 등록 시 환불+A/S 한번에" 요청의 자동화 경로.
      if (item.warrantyMonths !== null) {
        setIsElectronics(true);
        setWarrantyMonths(String(item.warrantyMonths));
      }
      setCategory(item.category ?? 'OTHER');
      setCategoryTags(item.categoryTags.length > 0 ? item.categoryTags : [item.category ?? 'OTHER']);
    }
    setBrand(item.brand ?? '');
    setBrandDomain(item.brandDomain ?? null);
    setOriginalAmount(item.originalAmount ?? null);
    setOriginalCurrency(item.originalCurrency ?? null);
    setExchangeRate(item.exchangeRate ?? null);
    setPendingConfirmId(item.id);
  };

  const handleIgnorePending = async (id: number) => {
    await ignorePendingPurchase(id);
    // 지금 등록 폼에 띄워놓고 보던(확인 후 바로 등록으로 연 그) 확인 대기 항목을 무시한 거라면
    // 폼도 같이 닫는다 — 이미 없어진 대기 항목의 내용이 입력창에 그대로 남아있으면 안 되니까.
    // 지금 보고 있는 것과 "다른" 대기 항목을 무시한 거라면 폼은 그대로 둔다.
    if (pendingConfirmId === id) {
      resetForm();
    }
    // 서버가 이미 처리를 끝냈으니 목록을 통째로 다시 GET(loadPending)하지 않고 그 항목만 바로 빼서
    // 체감 속도를 올린다.
    setPendingItems((items) => items.filter((item) => item.id !== id));
  };

  /** 가격 인상 감지 카드의 "가격 반영" — 새 항목을 만들지 않고 매칭된 기존 항목의 금액만 갱신한다. */
  const handleApplyPriceChange = async (id: number) => {
    await applyPriceChange(id);
    await loadPending();
    await load();
    await loadSpendHistory();
  };


  const handleRegenerateForwardingAddress = async () => {
    if (!window.confirm('주소를 재생성하면 기존 주소로는 더 이상 메일을 받을 수 없어요. 계속할까요?')) return;
    setRegenerating(true);
    try {
      const result = await regenerateForwardingAddress();
      setForwardingEmail(result.forwardingEmail);
    } catch (err) {
      console.error(err);
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyForwardingEmail = async () => {
    if (!forwardingEmail) return;
    try {
      await navigator.clipboard.writeText(forwardingEmail);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const closeArrivalConfirmModal = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('confirmArrival');
        next.delete('confirmArrivalBatch');
        next.delete('confirmArrivalItems');
        return next;
      },
      { replace: true }
    );
    setArrivalConfirmDone(false);
    setArrivalConfirmError(null);
  };

  /** daysAgo(0/1/2)를 답하면 그 실제 도착일이 새 스케줄 앵커로 확정된다 — 서버가 이후 회차를 그
   *  날짜 기준으로 다시 계산한다. */
  const handleArrivalConfirm = async (daysAgo: number) => {
    if (!confirmArrivalToken) return;
    setArrivalConfirmSubmitting(true);
    setArrivalConfirmError(null);
    try {
      await confirmArrival(confirmArrivalToken, daysAgo);
      setArrivalConfirmDone(true);
      await load();
    } catch (err) {
      console.error(err);
      setArrivalConfirmError('이미 처리되었거나 만료된 알림이에요.');
    } finally {
      setArrivalConfirmSubmitting(false);
    }
  };

  const closeRecurringConfirmModal = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('confirmRecurring');
        next.delete('confirmRecurringBatch');
        return next;
      },
      { replace: true }
    );
    setConfirmedRecurringIds([]);
  };

  const handleDashboardArrivalConfirm = async (id: number, daysAgo: number) => {
    setDashboardArrivalSubmittingId(id);
    try {
      await confirmArrivalForPurchase(id, daysAgo);
      await load();
    } catch (err) {
      console.error(err);
      setErrorMessage('도착 확인을 처리하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setDashboardArrivalSubmittingId(null);
    }
  };

  const handleArrivalBatchConfirm = async () => {
    if (!confirmArrivalBatchToken) return;
    setArrivalConfirmSubmitting(true);
    setArrivalConfirmError(null);
    try {
      await confirmArrivalBatch(confirmArrivalBatchToken, arrivalBatchReceived);
      await load();
      closeArrivalConfirmModal();
    } catch (err) {
      console.error(err);
      setArrivalConfirmError('배송 확인을 처리하지 못했어요. 다시 시도해주세요.');
    } finally {
      setArrivalConfirmSubmitting(false);
    }
  };

  const handleRecurringBatchConfirm = async () => {
    if (!confirmRecurringBatchToken) return;
    setArrivalConfirmSubmitting(true);
    try {
      await confirmRecurringBatch(confirmRecurringBatchToken, recurringBatchMaintainedIds);
      await load();
      closeRecurringConfirmModal();
    } catch (err) {
      console.error(err);
      setErrorMessage('유지 여부를 처리하지 못했어요. 다시 시도해주세요.');
    } finally {
      setArrivalConfirmSubmitting(false);
    }
  };

  const handleDashboardArrivalSnooze = async (id: number) => {
    setDashboardArrivalSubmittingId(id);
    try {
      await snoozeArrivalForPurchase(id);
      await load();
    } catch (err) {
      console.error(err);
      setErrorMessage('내일 다시 묻도록 설정하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setDashboardArrivalSubmittingId(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setShowPremiumUpsell(false);
    const input = {
      type,
      itemName,
      baseDate,
      expectedDeliveryDate: type !== 'SUBSCRIPTION' && expectedDeliveryDate.trim() !== '' ? expectedDeliveryDate : null,
      amount: parseAmountInput(amount),
      warrantyMonths: type === 'GENERAL' && isElectronics ? Number(warrantyMonths) : undefined,
      returnDeadlineDays: type === 'GENERAL' ? Number(returnDeadlineDays) : undefined,
      intervalDays: isRecurringType(type) && scheduleType === 'INTERVAL' ? Number(intervalDays) : undefined,
      scheduleType: isRecurringType(type) ? scheduleType : undefined,
      fixedDayOfMonth: isRecurringType(type) && scheduleType === 'FIXED_DAY' ? Number(fixedDayOfMonth) : undefined,
      isOneTime: isRecurringType(type) ? isOneTime : false,
      category,
      categoryTags: categoryTags.includes(category) ? categoryTags : [category, ...categoryTags],
      brand: brand.trim() || null,
      brandDomain: brand.trim() ? brandDomain : null,
      originalAmount,
      originalCurrency,
      exchangeRate,
    };
    const confirmingPendingId = pendingConfirmId;
    try {
      if (editingId !== null) {
        const updated = await updatePurchase(editingId, input);
        applyPurchaseUpsert(updated);
      } else {
        // 등록과 "확인 대기 처리"는 서로 독립적인 호출이라 동시에 보낸다(순차 대기 X) —
        // 응답으로 이미 최신 Purchase를 받으므로 이후 목록 재조회(load 등)도 생략한다.
        const [created] = await Promise.all([
          createPurchase(input),
          confirmingPendingId !== null ? confirmPendingPurchase(confirmingPendingId) : Promise.resolve(),
        ]);
        applyPurchaseUpsert(created);
        if (confirmingPendingId !== null) {
          setPendingItems((items) => items.filter((item) => item.id !== confirmingPendingId));
        }
      }
      resetForm();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 402) {
        setErrorMessage(err.response.data?.message ?? '무료 플랜 등록 개수를 초과했습니다.');
        setShowPremiumUpsell(true);
      } else {
        setErrorMessage(
          editingId !== null ? '수정하지 못했습니다. 입력값을 확인해주세요.' : '등록하지 못했습니다. 입력값을 확인해주세요.'
        );
      }
      console.error(err);
    }
  };

  /** "취소" — 하드 삭제, 지출 통계에서도 완전히 빠진다(잘못 등록했거나 주문이 무효/환불된 경우). */
  const handleDelete = async (id: number) => {
    if (!window.confirm('취소하면 이 항목의 지출 기록도 완전히 사라져요. 계속할까요?')) return;
    await deletePurchase(id);
    await load();
    await loadSpendHistory();
  };

  /** "삭제" — 목록에서만 빠지고, 이미 발생한 지출은 월별/연간 통계에 계속 남는다. */
  const handleDiscard = async (id: number) => {
    if (!window.confirm('삭제하면 목록에서는 빠지지만, 이미 발생한 지출은 통계에 그대로 남아요. 계속할까요?')) return;
    await discardPurchase(id);
    await load();
    await loadSpendHistory();
  };

  /** "지난 항목" 탭의 "전체 삭제" — 지금 그 탭에 보이는 항목 전부를 한 번에 삭제(취소 아님, 지출은 남음). */
  const handleDiscardAll = async () => {
    if (overdueItems.length === 0) return;
    if (
      !window.confirm(
        `지난 항목 ${overdueItems.length}건을 한 번에 삭제할까요? 목록에서는 빠지지만, 이미 발생한 지출은 통계에 그대로 남아요.`
      )
    )
      return;
    await discardAllPurchases(overdueItems.map((p) => p.id));
    await load();
    await loadSpendHistory();
  };

  const handleMarkDelivered = async (id: number) => {
    await markDelivered(id);
    await load();
  };

  const handleRecurringSelectionConfirm = async (id: number) => {
    await handleMarkDelivered(id);
    setConfirmedRecurringIds((ids) => [...ids, id]);
  };

  /** "유지 안 함" — 확인 필요 목록에서 이 항목만 제외하고, 절약 후보 쪽으로 확정 이동시킨다. */
  const handleDiscontinue = async (id: number) => {
    await discontinuePurchase(id);
    // 지출 집계는 별도 scope=spend 응답을 사용하므로, 목록만 갱신하면 중단한 항목이 예상
    // 지출에 잠시 남을 수 있다. 두 데이터를 함께 새로고침한다.
    await Promise.all([load(), loadSpendHistory()]);
  };

  const handleDisableDeadlineNotifications = async (id: number) => {
    await disableDeadlineNotifications(id);
    await load();
  };

  /**
   * "전체 확인" — 확인이 필요한(연속 미확인) 정기배송/구독을 한 번에 "유지하기" 처리한다.
   * 하나씩 누르기 번거롭다는 피드백으로 추가. 처리 후 몇 개월째 이용 중인지 한 줄로 알려준다.
   */
  const handleConfirmAll = async () => {
    const targets = needsConfirmationItems;
    if (targets.length === 0) return;
    await confirmAllDelivered(targets.map((p) => p.id));

    const detail = targets
      .map((p) => {
        const months = Math.max(1, Math.round(daysSinceBaseDate(p.baseDate) / 30));
        const kind = p.type === 'RECURRING_DELIVERY' ? '정기배송 신청' : '구독';
        return `${p.itemName} ${months}개월째 ${kind} 중`;
      })
      .join(' · ');
    setConfirmAllMessage(`이번 달도 ${targets.length}개 항목을 이용 중으로 표시했습니다. (${detail})`);
    window.setTimeout(() => setConfirmAllMessage(null), 8000);

    await load();
  };

  const handleArchive = async (id: number) => {
    await archivePurchase(id);
    await load();
    await loadSpendHistory();
  };

  const handleUnarchive = async (id: number) => {
    await unarchivePurchase(id);
    await loadArchived();
    await load();
    await loadSpendHistory();
  };

  /** 완료든 건너뛰기든 동일하게 처리한다 — focusForm만 마지막 단계 CTA(등록하러 가기)에서 true. */
  const handleOnboardingDone = async (focusForm: boolean) => {
    completeOnboarding();
    try {
      await apiCompleteOnboarding();
    } catch (err) {
      console.error(err);
    }
    if (focusForm) {
      setShowRegisterForm(true);
      // 폼이 접혀있던 상태였다면 이 시점엔 아직 DOM에 없다 — 다음 페인트 이후로 미뤄서
      // itemNameInputRef가 실제로 붙은 뒤에 스크롤/포커스한다.
      setTimeout(() => {
        itemNameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        itemNameInputRef.current?.focus();
      }, 0);
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExporting(true);
    try {
      await downloadExport(format);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const urgent = purchases
    .filter((p) => isRecurringType(p.type) ? p.dDay === 0 : p.dDay >= 0 && p.dDay <= URGENT_WINDOW_DAYS)
    .sort((a, b) => a.dDay - b.dDay);
  const urgentAllHandled = urgent.length > 0 && urgent.every(isFullyConfirmed);

  /** 프리미엄 알림 기능(주간 요약) — 이번 주(오늘부터 7일 이내) 예정인 정기배송·구독. */
  const weeklyRecurring = purchases
    .filter((p) => isRecurringType(p.type) && p.discontinuedAt === null && p.dDay >= 0 && p.dDay <= URGENT_WINDOW_DAYS)
    .sort((a, b) => a.dDay - b.dDay);
  /**
   * 배송 예정에는 정기배송뿐 아니라 도착 예정일이 있는 일반 구매도 포함한다.
   * GENERAL의 deadline은 반품/A·S 기한이라 실제 도착일과 다르므로 expectedDeliveryDate를 따로 본다.
   */
  const weeklyDeliveries = purchases
    .filter((p) =>
      p.discontinuedAt === null && (p.type === 'RECURRING_DELIVERY'
        ? p.dDay >= 0 && p.dDay <= URGENT_WINDOW_DAYS
        : p.type === 'GENERAL' && p.expectedDeliveryDate !== null && isWithinUpcomingDays(p.expectedDeliveryDate, URGENT_WINDOW_DAYS))
    )
    .sort((a, b) => {
      const aDate = a.type === 'GENERAL' ? a.expectedDeliveryDate! : a.deadline;
      const bDate = b.type === 'GENERAL' ? b.expectedDeliveryDate! : b.deadline;
      return aDate.localeCompare(bDate);
    });
  // "한 번만 사용"도 이번 이용 기간의 예정에는 포함한다. 다음 갱신이 없다는 점은 목록에서 표시한다.
  const weeklySubscriptions = weeklyRecurring.filter((p) => p.type === 'SUBSCRIPTION');
  const today = todayDateOnly();
  const calendarWeek = currentCalendarWeekRange(today);
  /**
   * 요약 카드에는 이번 주 월요일부터 오늘까지 이미 도래한 결제 회차만 센다.
   * 이번 주 후반의 예정 결제는 '결제 예정' 목록에만 남기고 완료 건수에는 넣지 않는다.
   */
  const weeklyPaymentCount = purchases
    .filter((purchase) => purchase.type === 'SUBSCRIPTION' && purchase.discontinuedAt === null)
    .reduce((count, purchase) => {
      const startYear = Number(calendarWeek.start.slice(0, 4));
      const startMonth = Number(calendarWeek.start.slice(5, 7));
      const endYear = Number(calendarWeek.end.slice(0, 4));
      const endMonth = Number(calendarWeek.end.slice(5, 7));
      const dates = [
        ...occurrenceDatesInMonth(purchase, startYear, startMonth),
        ...(startYear === endYear && startMonth === endMonth ? [] : occurrenceDatesInMonth(purchase, endYear, endMonth)),
      ];
      return count + dates.filter((date) => date >= calendarWeek.start && date <= today).length;
    }, 0);
  type WeeklyEntry = { purchase: Purchase; completed: boolean; completedAt: string | null };
  const completedThisWeek = (purchase: Purchase) => purchase.lastDeliveredDate !== null && isWithinRecentDays(purchase.lastDeliveredDate, URGENT_WINDOW_DAYS);
  // "유지 안 함"을 누르면 정기 스케줄은 곧바로 다음 회차를 가리킬 수 있다. 그 때문에
  // 오늘/이번 주에 구독을 끝냈어도 예정일 필터만으로는 주간 티켓에서 빠진다. 처리한 주에는
  // 이력을 한 번 남겨야 사용자가 이번 주에 어떤 구독을 중단했는지 바로 알 수 있다.
  const discontinuedThisWeek = (purchase: Purchase) =>
    purchase.discontinuedAt !== null && isWithinRecentDays(purchase.discontinuedAt.slice(0, 10), URGENT_WINDOW_DAYS);
  const previousSubscriptionSchedule = (purchase: Purchase) =>
    purchase.scheduleType === 'FIXED_DAY'
      ? previousFixedScheduleDate(purchase.deadline, purchase.fixedDayOfMonth ?? 1)
      : shiftDateOnly(purchase.deadline, -(purchase.intervalDays ?? 30));
  const discontinuedScheduledThisWeek = (purchase: Purchase) =>
    purchase.discontinuedAt !== null && isWithinRecentDays(previousSubscriptionSchedule(purchase), URGENT_WINDOW_DAYS);
  const weeklyDeliveryEntries: WeeklyEntry[] = [
    ...weeklyDeliveries.map((purchase) => ({ purchase, completed: completedThisWeek(purchase), completedAt: purchase.lastDeliveredDate })),
    ...purchases
      .filter((purchase) => (purchase.type === 'GENERAL' || purchase.type === 'RECURRING_DELIVERY') && completedThisWeek(purchase) && !weeklyDeliveries.some((item) => item.id === purchase.id))
      .map((purchase) => ({ purchase, completed: true, completedAt: purchase.lastDeliveredDate })),
  ];
  const weeklySubscriptionEntries: WeeklyEntry[] = [
    // "한 번만 사용"은 등록 시점에 다음 회차를 만들지 않도록 선택한 상태다. 따라서
    // 이번 주 구독 예정에서도 실제 유지 확인을 기다리는 것처럼 보이지 않게 유지 안 함으로 표시한다.
    ...weeklySubscriptions.map((purchase) => ({
      purchase,
      completed: purchase.isOneTime || purchase.discontinuedAt !== null || completedThisWeek(purchase),
      completedAt: purchase.lastDeliveredDate,
    })),
    ...purchases
      .filter((purchase) => purchase.type === 'SUBSCRIPTION' && completedThisWeek(purchase) && !weeklySubscriptions.some((item) => item.id === purchase.id))
      .map((purchase) => ({ purchase, completed: true, completedAt: purchase.lastDeliveredDate })),
    ...purchases
      .filter(
        (purchase) =>
          purchase.type === 'SUBSCRIPTION' &&
          (discontinuedThisWeek(purchase) || discontinuedScheduledThisWeek(purchase)) &&
          !completedThisWeek(purchase) &&
          !weeklySubscriptions.some((item) => item.id === purchase.id),
      )
      .map((purchase) => ({
        purchase,
        completed: true,
        completedAt: discontinuedScheduledThisWeek(purchase) ? previousSubscriptionSchedule(purchase) : purchase.discontinuedAt!.slice(0, 10),
      })),
  ];
  /** 푸시를 놓쳐도 대시보드에서 답할 수 있는 오늘의 도착 확인 항목. */
  const arrivalChecks = purchases.filter((p) => {
    if (p.type === 'SUBSCRIPTION') return false;
    if (p.arrivalCheckSnoozedUntil !== null) return true;
    return p.type === 'GENERAL' ? p.lastDeliveredDate === null && p.expectedDeliveryDate === today : p.isOneTime ? p.lastDeliveredDate === null && p.expectedDeliveryDate === today : p.dDay === 0;
  });
  const arrivalSnoozedCount = arrivalChecks.filter((p) => p.arrivalCheckSnoozedUntil !== null).length;

  /** 메인 요약 보드 — 활성 항목 기준(archived 제외, purchases가 이미 그렇게 온다). */
  const recurringDeliveryCount = purchases.filter((p) => p.type === 'RECURRING_DELIVERY' && p.discontinuedAt === null).length;
  const subscriptionCount = purchases.filter((p) => p.type === 'SUBSCRIPTION' && p.discontinuedAt === null).length;
  /** "정기배송"/"정기구독" 타일 상세 — 아래 목록과 달리 날짜순이 아니라 카테고리별로 묶어서 보여준다. */
  const recurringDeliveryGroups = groupByCategory(purchases.filter((p) => p.type === 'RECURRING_DELIVERY'));
  const subscriptionGroups = groupByCategory(purchases.filter((p) => p.type === 'SUBSCRIPTION'));

  /** N일마다 항목은 30일 기준 월 환산액으로, 매월 특정일 고정 항목은 금액을 그대로 더한다. */
  const monthlyEquivalent = (p: Purchase): number =>
    p.scheduleType === 'FIXED_DAY' ? p.amount! : (p.amount! * 30) / (p.intervalDays || 30);

  const [currentYearNum, currentMonthNum] = today.split('-').map(Number);

  /**
   * "이번 달 예상지출" 클릭 시 펼쳐지는 항목별 내역 — 정기배송/구독은 이번 달에 실제로 결제되는
   * 날짜마다 한 줄씩(같은 항목이 여러 번 결제되면 그만큼 여러 줄), GENERAL 같은
   * 1회성 결제도 baseDate가 이번 달이면 그 날짜에 포함한다. 금액이 없는 항목은 제외.
   */
  const spendingOccurrences = spendHistoryPurchases.flatMap((p) => {
    if (p.amount === null) return [];
    if (isRecurringType(p.type)) {
      return occurrenceDatesInMonth(p, currentYearNum, currentMonthNum).map((date, idx) => ({
        key: `${p.id}-${idx}`,
        itemName: p.itemName,
        type: p.type,
        date,
        amount: p.amount!,
      }));
    }
    const [baseYear, baseMonth] = p.baseDate.split('-').map(Number);
    if (baseYear !== currentYearNum || baseMonth !== currentMonthNum) return [];
    return [{ key: String(p.id), itemName: p.itemName, type: p.type, date: p.baseDate, amount: p.amount }];
  });

  /** 위 내역을 날짜순으로 묶은 것 — "8월 7일 아래 상품 2개, 8월 16일 아래 상품 1개" 형태로 보여준다. */
  const spendingByDate = Object.values(
    spendingOccurrences.reduce<Record<string, { date: string; items: typeof spendingOccurrences; total: number }>>(
      (acc, occ) => {
        if (!acc[occ.date]) acc[occ.date] = { date: occ.date, items: [], total: 0 };
        acc[occ.date].items.push(occ);
        acc[occ.date].total += occ.amount;
        return acc;
      },
      {}
    )
  ).sort((a, b) => a.date.localeCompare(b.date));

  const monthlySpendEstimate = spendingOccurrences.reduce((sum, occ) => sum + occ.amount, 0);

  /** 특정 지출 계산기: 활성 항목을 카테고리와 개별 항목으로 좁혀 이번 달 발생 예정액을 계산한다. */
  const calculatorCandidates = purchases.filter((p) => p.amount !== null && p.discontinuedAt === null);
  const calculatorTypeFiltered = calculatorCandidates.filter(
    (p) => calculatorType === 'ALL' || p.type === calculatorType
  );
  const calculatorAvailableCategories = PURCHASE_CATEGORIES.filter((cat) =>
    calculatorTypeFiltered.some((p) => p.category === cat)
  );
  const calculatorCategoryFiltered = calculatorTypeFiltered.filter(
    (p) => calculatorCategories.length === 0 || (p.category !== null && calculatorCategories.includes(p.category))
  );
  const calculatorSelectedItems = calculatorCategoryFiltered.filter(
    (p) => calculatorSelectedItemIds.includes(p.id)
  );
  const calculatorAmount = Math.round(calculatorSelectedItems.reduce((sum, p) => {
    if (isRecurringType(p.type)) return sum + occurrencesInMonth(p, currentYearNum, currentMonthNum) * p.amount!;
    const [baseYear, baseMonth] = p.baseDate.split('-').map(Number);
    return sum + (baseYear === currentYearNum && baseMonth === currentMonthNum ? p.amount! : 0);
  }, 0));

  /** "올해 예상 지출" — 1~12월 각각의 실제 지출 총액(정기 결제 발생 횟수 + 1회성 결제)과 그 합계. */
  const monthlySpendTotals = Array.from({ length: 12 }, (_, i) => totalSpendInMonth(spendHistoryPurchases, currentYearNum, i + 1));
  const yearlySpendEstimate = monthlySpendTotals.reduce((sum, v) => sum + v, 0);

  /**
   * 각 달을 전월 대비로 비교 — 1월은 작년 12월과 비교(연 경계도 실제 데이터로 계산). 아직 오지
   * 않은 달(이번 달보다 미래)은 "예상"일 뿐 실제 증감이라 부르기 애매해 색을 입히지 않는다
   * (isFuture=true). %는 전월 지출이 0원이면 나눗셈이 무의미해 "신규"로 대신 표시한다.
   */
  const monthlySpendDetails = monthlySpendTotals.map((total, i) => {
    const month = i + 1;
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? currentYearNum - 1 : currentYearNum;
    const prevTotal = totalSpendInMonth(spendHistoryPurchases, prevYear, prevMonth);

    const trend: 'up' | 'down' | 'flat' = total > prevTotal ? 'up' : total < prevTotal ? 'down' : 'flat';
    const percentLabel =
      prevTotal > 0
        ? `${Math.round(((total - prevTotal) / prevTotal) * 100) > 0 ? '+' : ''}${Math.round(
            ((total - prevTotal) / prevTotal) * 100
          )}%`
        : total > 0
          ? '신규'
          : '0%';

    return { month, total, trend, percentLabel, isFuture: month > currentMonthNum };
  });

  /**
   * "카테고리별 분석"은 요약 타일의 이번 달 예상 지출과 같은 기준이다. 정기배송·구독뿐 아니라
   * 이번 달에 발생하는 일반배송까지 포함해, 새로 등록한 모든 카테고리가 누락되지 않게 한다.
   */
  const categoryCounts = PURCHASE_CATEGORIES.map((cat) => {
    const items = spendHistoryPurchases.filter((p) => p.category === cat && p.amount !== null);
    const count = items.filter((p) => {
      if (isRecurringType(p.type)) return occurrencesInMonth(p, currentYearNum, currentMonthNum) > 0;
      const [year, month] = p.baseDate.split('-').map(Number);
      return year === currentYearNum && month === currentMonthNum;
    }).length;
    return { category: cat, count, amount: totalSpendInMonth(items, currentYearNum, currentMonthNum) };
  }).filter((c) => c.count > 0 || c.amount > 0);
  const uncategorizedSpendCount = spendHistoryPurchases.filter((p) => {
    if (p.category !== null || p.amount === null) return false;
    if (isRecurringType(p.type)) return occurrencesInMonth(p, currentYearNum, currentMonthNum) > 0;
    const [year, month] = p.baseDate.split('-').map(Number);
    return year === currentYearNum && month === currentMonthNum;
  }).length;

  /** 확인 대기 중인 "가격 인상 감지" 건수 — pending-purchase-intake.ts가 matched_purchase_id를 채운 것만. */
  const priceChangeCount = pendingItems.filter((item) => item.matchedPurchaseId !== null).length;

  /**
   * "AI 절약 제안"/절약 후보 — 사용자가 "유지 안 함"으로 명시했거나(discontinuedAt), 연속
   * MISSED_ROUNDS_REVIEW_THRESHOLD(3)회차 이상 "유지하기"를 안 누른 정기배송/구독. 실제 사용
   * 여부를 직접 아는 건 아니라 참고용 추천이다 — isExplicit=false(미확인 추정)면 화면에서
   * "사용 안 함"이라 단정하지 말고 "최근 이용 상태가 확인되지 않았습니다"로 표현해야 한다.
   */
  const reviewCandidates = purchases
    .filter(
      (p) =>
        isRecurringType(p.type) && !p.isOneTime &&
        p.amount !== null &&
        (p.discontinuedAt !== null || missedRoundsFor(p) >= MISSED_ROUNDS_REVIEW_THRESHOLD)
    )
    .map((p) => ({
      id: p.id,
      itemName: p.itemName,
      monthly: Math.round(monthlyEquivalent(p)),
      /** true면 사용자가 "유지 안 함"으로 직접 표시(확정). false면 미확인 회차 누적으로 추정(참고용). */
      isExplicit: p.discontinuedAt !== null,
      missedRounds: missedRoundsFor(p),
    }));
  const savingsEstimate = reviewCandidates.reduce((sum, item) => sum + item.monthly, 0);

  /**
   * "확인 필요" 패널의 대상 — 1회차 이상 "유지하기"가 안 눌렸고 아직 "유지 안 함"으로도 표시되지
   * 않은 정기배송/구독. reviewCandidates(3회차 이상, 절약 후보 확정)보다 범위가 넓다 — 1~2회차
   * 미확인은 여기엔 포함되지만 아직 절약 후보로 올리진 않는다(전체확인/유지 안 함 버튼의 대상).
   */
  const needsConfirmationItems = purchases.filter(
    (p) => isRecurringType(p.type) && !p.isOneTime && p.discontinuedAt === null && missedRoundsFor(p) >= 1
  );

  /**
   * "가격 인상" 타일 상세용 구독/정기배송 3분류. 우선순위는 확인 대기 중인 가격 인상 >
   * 절약 제안(미사용 의심) > 정상 — 둘 다 해당돼도 하나의 상태로만 표시한다.
   * "사용 안 함"은 reviewCandidates(AI 절약 제안)와 완전히 같은 기준을 재사용한 것일 뿐,
   * 실사용 데이터를 보는 게 아니라서 참고용이다 — 더 정교한 사용빈도 감지 로직은 아직 없음.
   */
  const priceChangePurchaseIds = new Set(
    pendingItems.filter((item) => item.matchedPurchaseId !== null).map((item) => item.matchedPurchaseId!)
  );
  const reviewCandidateIds = new Set(reviewCandidates.map((item) => item.id));
  const recurringPurchases = purchases.filter((p) => isRecurringType(p.type));
  const priceUpItems = recurringPurchases.filter((p) => priceChangePurchaseIds.has(p.id));
  const unusedItems = recurringPurchases.filter(
    (p) => !priceChangePurchaseIds.has(p.id) && reviewCandidateIds.has(p.id)
  );
  const normalItems = recurringPurchases.filter(
    (p) => !priceChangePurchaseIds.has(p.id) && !reviewCandidateIds.has(p.id)
  );

  /** "내 목록"(전체)은 지난 항목을 제외한다 — 지난 항목은 별도 탭(OVERDUE)에 모아둔다. */
  const overdueItems = purchases.filter(isOverdue);
  const nonOverduePurchases = purchases.filter((p) => !isOverdue(p));

  /** 이 종류(filterType) 안에 실제로 존재하는 카테고리만 2차 필터 칩으로 노출한다(빈 칩 방지). */
  const categoryFilterOptions: ('UNCATEGORIZED' | PurchaseCategory)[] =
    filterType === 'ALL'
      ? []
      : [
          ...PURCHASE_CATEGORIES.filter((c) => nonOverduePurchases.some((p) => p.type === filterType && p.category === c)),
          ...(nonOverduePurchases.some((p) => p.type === filterType && p.category === null) ? (['UNCATEGORIZED'] as const) : []),
        ];

  const displayedPurchases = nonOverduePurchases.filter((p) => {
    if (filterType !== 'ALL' && p.type !== filterType) return false;
    if (filterCategory === 'ALL') return true;
    if (filterCategory === 'UNCATEGORIZED') return p.category === null;
    return p.category === filterCategory;
  });
  const purchasesTotalPages = Math.max(1, Math.ceil(displayedPurchases.length / PURCHASES_PAGE_SIZE));
  // 삭제 등으로 총 페이지 수가 줄어 현재 페이지가 범위를 벗어나면(마지막 페이지가 비는 경우)
  // 렌더링에서만 안전하게 보정한다 — 상태 자체는 다음 페이지 이동 시 자연히 맞춰진다.
  const safePurchasesPage = Math.min(purchasesPage, purchasesTotalPages);
  const pagedPurchases = displayedPurchases.slice(
    (safePurchasesPage - 1) * PURCHASES_PAGE_SIZE,
    safePurchasesPage * PURCHASES_PAGE_SIZE
  );

  // 신규 가입자 온보딩 — 아직 안 봤고(hasSeenOnboarding=false), 목록 조회가 끝난 뒤에도 등록된
  // 항목이 하나도 없을 때만 띄운다. purchasesLoaded 가드가 없으면 데이터 도착 전 순간적으로
  // purchases.length===0이라 깜빡 떴다 사라지는 게 보일 수 있다.
  const showOnboarding = purchasesLoaded && !hasSeenOnboarding && purchases.length === 0;
  const recurringSelectionItems = purchases.filter(
    (p) => confirmRecurringIds.includes(p.id) && isRecurringType(p.type) && !confirmedRecurringIds.includes(p.id)
  );
  const arrivalBatchItems = purchases.filter((p) => confirmArrivalBatchIds.includes(p.id) && p.type !== 'SUBSCRIPTION');

  return (
    <div className="dashboard">
      {showOnboarding && <OnboardingOverlay onDone={handleOnboardingDone} />}
      {confirmRecurringIds.length > 0 && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true">
          <div className="onboarding-modal">
            <p className="onboarding-modal__title">🔔 다음 회차에도 유지할 항목을 선택하세요</p>
            <p className="onboarding-modal__body">다음 배송·결제가 예정된 항목이에요. 유지할 항목만 체크하세요.</p>
            <div className="arrival-modal__choices">
              {recurringSelectionItems.map((p) => (
                <label key={p.id} className="schedule-radio">
                  <input type="checkbox" checked={recurringBatchMaintainedIds.includes(p.id)} onChange={(e) =>
                    setRecurringBatchMaintainedIds((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                  } />
                  {p.itemName}
                </label>
              ))}
              {recurringSelectionItems.length === 0 && <p className="onboarding-modal__body">처리할 항목이 없어요.</p>}
            </div>
            <div className="onboarding-modal__actions">
              {confirmRecurringBatchToken && <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={handleRecurringBatchConfirm}>선택한 {recurringBatchMaintainedIds.length}건 다음 회차 유지 · 나머지 {Math.max(0, recurringSelectionItems.length - recurringBatchMaintainedIds.length)}건 중단</button>}
              <button type="button" className="btn-text" onClick={closeRecurringConfirmModal}>닫기</button>
            </div>
          </div>
        </div>
      )}
      {confirmArrivalBatchToken && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true">
          <div className="onboarding-modal">
            <p className="onboarding-modal__title">📦 받은 배송만 선택하세요</p>
            <p className="onboarding-modal__body">선택하지 않은 배송은 내일 다시 알려드리고, 오늘 대시보드에도 계속 남겨둘게요.</p>
            {arrivalConfirmError && <p className="form-error">{arrivalConfirmError}</p>}
            <div className="arrival-modal__choices">
              {arrivalBatchItems.map((p) => {
                const selected = arrivalBatchReceived.find((item) => item.id === p.id);
                return <div key={p.id} className="arrival-batch-item">
                  <label className="schedule-radio"><input type="checkbox" checked={Boolean(selected)} onChange={(e) =>
                    setArrivalBatchReceived((items) => e.target.checked ? [...items, { id: p.id, daysAgo: 0 }] : items.filter((item) => item.id !== p.id))
                  } />{p.itemName} · {p.type === 'RECURRING_DELIVERY' ? '정기배송' : '일반배송'}</label>
                  {selected && <select value={selected.daysAgo} onChange={(e) => setArrivalBatchReceived((items) => items.map((item) => item.id === p.id ? { ...item, daysAgo: Number(e.target.value) } : item))}>
                    {Array.from({ length: 31 }, (_, daysAgo) => <option key={daysAgo} value={daysAgo}>{daysAgo === 0 ? '오늘 받았어요' : `${daysAgo}일 전 수령`}</option>)}
                  </select>}
                </div>;
              })}
            </div>
            <div className="onboarding-modal__actions">
              <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={handleArrivalBatchConfirm}>선택한 {arrivalBatchReceived.length}건 수령 처리 · 나머지 {Math.max(0, arrivalBatchItems.length - arrivalBatchReceived.length)}건 내일 알림</button>
              <button type="button" className="btn-text" onClick={closeArrivalConfirmModal}>나중에</button>
            </div>
          </div>
        </div>
      )}
      {confirmArrivalToken && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true">
          <div className="onboarding-modal">
            {arrivalConfirmDone ? (
              <>
                <p className="onboarding-modal__title">확인했어요!</p>
                <p className="onboarding-modal__body">
                  오늘 날짜를 기준으로 정기배송 사이클을 조정했어요.
                </p>
                <div className="onboarding-modal__actions">
                  <button type="button" className="btn" onClick={closeArrivalConfirmModal}>
                    닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="onboarding-modal__title">📦 오늘 주문하신 물건이 오셨나요?</p>
                <p className="onboarding-modal__body">
                  언제 받으셨는지 알려주시면 이후 배송 주기를 그 날짜 기준으로 다시 계산할게요.
                </p>
                {arrivalConfirmError && <p className="form-error">{arrivalConfirmError}</p>}
                <div className="arrival-modal__choices">
                  <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={() => handleArrivalConfirm(0)}>
                    받았어요
                  </button>
                  <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={() => handleArrivalConfirm(1)}>
                    하루 전에 받았어요
                  </button>
                  <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={() => handleArrivalConfirm(2)}>
                    이틀 전에 받았어요
                  </button>
                </div>
                <div className="onboarding-modal__actions">
                  <button type="button" className="btn-text" onClick={closeArrivalConfirmModal}>
                    아직 미도착 / 나중에
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="dashboard-header">
        <h1>
          {isPremium && <PremiumBadge premiumSince={premiumSince} paymentCount={paymentCount} />}
          {nickname}님의 <span className="accent">챙길 목록</span>
        </h1>
        {!isPremium && (
          <Link to="/pricing" className="plan-counter mono">
            {purchases.length}/{FREE_PLAN_MAX_PURCHASES}개 등록됨
          </Link>
        )}
      </div>

      <PushPermissionBanner />

      {forwardingEmail && (
        <div className="forwarding-banner">
          <span className="forwarding-banner__label">📧 주문확인 메일 자동 등록 주소</span>
          <div className="forwarding-banner__row">
            <span className="mono forwarding-banner__address">{forwardingEmail}</span>
            <button type="button" className="btn btn-sm forwarding-banner__copy" onClick={handleCopyForwardingEmail}>
              {addressCopied ? '복사됨 ✓' : '📋 복사'}
            </button>
            <button type="button" className="btn-text" onClick={handleRegenerateForwardingAddress} disabled={regenerating}>
              {regenerating ? '재생성 중...' : '재생성'}
            </button>
          </div>
          <p className="forwarding-banner__hint">
            쇼핑몰 주문확인 메일을 이 주소로 전달(포워딩)하면 자동으로 아래 "확인 대기" 목록에 올라와요.
          </p>
          <div className="forwarding-banner__guides">
            <details className="forwarding-guide">
              <summary>일반배송 등록 방법</summary>
              <div className="forwarding-guide__content">
                메일 내용에 <strong>도착</strong>만 적어 보내주시면(배송 주기는 필요 없어요) 그 날짜를
                기준으로 반품기한(7일)·A/S 보증(1년)을 계산해드려요.
                <br />
                <span className="mono">예시) 도착 4월 2일 / 4월 2일 도착</span>
              </div>
            </details>
            <details className="forwarding-guide">
              <summary>정기배송 등록 방법</summary>
              <div className="forwarding-guide__content">
                메일 내용에 <strong>배송 주기</strong>와 <strong>도착</strong>을 함께 적어 보내주시면
                AI가 이후 결제일과 배송일을 자동으로 관리해요. 실제 스토어 주문확인 메일에는 배송
                주기가 거의 안 적혀 있어서, 전달하실 때 이 두 가지를 직접 적어주셔야 해요. 몇 일마다
                오는 게 아니라 <strong>매월 특정일에 고정으로</strong> 오는 경우엔 주기 대신 "고정
                N일"처럼 적어주세요.
                <br />
                <span className="mono">
                  예시) 주기 4주 / 1개월 / 2개월 주기 / 6개월 주기
                  <br />
                  예시) 고정 15일 / 매월 15일 고정
                  <br />
                  예시) 도착 4월 2일 / 4월 2일 도착
                </span>
              </div>
            </details>
          </div>
          <p className="forwarding-banner__privacy">
            🔒 전달하신 이메일은 상품명·날짜 추출을 위해 Claude API(Anthropic)로 처리되며, 처리 후
            원본은 저장되지 않습니다.
          </p>
        </div>
      )}

      {purchasesLoaded && purchases.length > 0 && (
        <div className="summary-board">
          <button
            type="button"
            className="summary-board__tile summary-board__tile--spending summary-board__tile--clickable"
            onClick={() => setShowSpendingDetail((v) => !v)}
            aria-expanded={showSpendingDetail}
          >
            <span className="summary-board__icon" aria-hidden="true">💳</span>
            <div className="summary-board__text">
              <span className="summary-board__label">{currentMonthNum}월 예상지출</span>
              <span className="summary-board__value mono">
                {monthlySpendEstimate.toLocaleString('ko-KR')}
                <span className="summary-board__unit">원</span>
              </span>
            </div>
            <span className="summary-board__chevron" aria-hidden="true">{showSpendingDetail ? '▲' : '▾'}</span>
          </button>
          <button
            type="button"
            className="summary-board__tile summary-board__tile--yearly summary-board__tile--clickable"
            onClick={() => setShowYearlyDetail((v) => !v)}
            aria-expanded={showYearlyDetail}
          >
            <span className="summary-board__icon" aria-hidden="true">📈</span>
            <div className="summary-board__text">
              <span className="summary-board__label">올해 예상 지출</span>
              <span className="summary-board__value mono">
                {yearlySpendEstimate.toLocaleString('ko-KR')}
                <span className="summary-board__unit">원</span>
              </span>
            </div>
            <span className="summary-board__chevron" aria-hidden="true">{showYearlyDetail ? '▲' : '▾'}</span>
          </button>
          <div className="summary-board__tile summary-board__tile--week">
            <span className="summary-board__icon" aria-hidden="true">📅</span>
            <div className="summary-board__text">
              <span className="summary-board__label">이번 주 결제 완료</span>
              <span className="summary-board__value mono">
                {weeklyPaymentCount}
                <span className="summary-board__unit">건</span>
              </span>
              <span className="summary-board__unit summary-board__value-caption">월~오늘 기준</span>
            </div>
          </div>
          <button
            type="button"
            className="summary-board__tile summary-board__tile--delivery summary-board__tile--clickable"
            onClick={() => setShowRecurringDeliveryDetail((v) => !v)}
            aria-expanded={showRecurringDeliveryDetail}
          >
            <span className="summary-board__icon" aria-hidden="true">📦</span>
            <div className="summary-board__text">
              <span className="summary-board__label">정기배송</span>
              <span className="summary-board__value mono">
                {recurringDeliveryCount}
                <span className="summary-board__unit">건</span>
              </span>
            </div>
            <span className="summary-board__chevron" aria-hidden="true">{showRecurringDeliveryDetail ? '▲' : '▾'}</span>
          </button>
          <button
            type="button"
            className="summary-board__tile summary-board__tile--subscription summary-board__tile--clickable"
            onClick={() => setShowSubscriptionDetail((v) => !v)}
            aria-expanded={showSubscriptionDetail}
          >
            <span className="summary-board__icon" aria-hidden="true">🔄</span>
            <div className="summary-board__text">
              <span className="summary-board__label">정기구독</span>
              <span className="summary-board__value mono">
                {subscriptionCount}
                <span className="summary-board__unit">건</span>
              </span>
            </div>
            <span className="summary-board__chevron" aria-hidden="true">{showSubscriptionDetail ? '▲' : '▾'}</span>
          </button>
          {/* 인상 감지/절약 제안 둘 다 "평소엔 숨겨져 있다가 있을 때만 뜨는" 방식이면 사용자가 그런
              기능이 있는지조차 모르기 쉬워서, 값이 0이어도(비어있어도) 상시 표시한다. */}
          {isPremium ? (
            <button
              type="button"
              className="summary-board__tile summary-board__tile--price-change summary-board__tile--clickable"
              onClick={() => setShowPriceStatusDetail((v) => !v)}
              aria-expanded={showPriceStatusDetail}
            >
              <span className="summary-board__icon" aria-hidden="true">⚠</span>
              <div className="summary-board__text">
                <span className="summary-board__label">가격 인상 감지</span>
                <span className="summary-board__value mono">
                  {priceChangeCount}
                  <span className="summary-board__unit">건</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">{showPriceStatusDetail ? '▲' : '▾'}</span>
            </button>
          ) : (
            <Link to="/pricing" className="summary-board__tile summary-board__tile--price-change summary-board__tile--clickable">
              <span className="summary-board__icon" aria-hidden="true">⚠</span>
              <div className="summary-board__text">
                <span className="summary-board__label">가격 인상 감지</span>
                <span className="summary-board__ai-cta">🔒 프리미엄 전용</span>
              </div>
            </Link>
          )}
          <button
            type="button"
            className="summary-board__tile summary-board__tile--savings summary-board__tile--clickable"
            onClick={() => setShowSavingsDetail((v) => !v)}
            aria-expanded={showSavingsDetail}
          >
            <span className="summary-board__icon" aria-hidden="true">💡</span>
            <div className="summary-board__text">
              <span className="summary-board__label">AI 절약 제안</span>
              <span className="summary-board__value mono">
                {savingsEstimate.toLocaleString('ko-KR')}원
              </span>
              <span className="summary-board__unit summary-board__value-caption">절약 가능</span>
            </div>
            <span className="summary-board__chevron" aria-hidden="true">{showSavingsDetail ? '▲' : '▾'}</span>
          </button>
          <button
            type="button"
            className="summary-board__tile summary-board__tile--calculator summary-board__tile--clickable"
            onClick={() => setShowSpecificSpendCalculator((v) => !v)}
            aria-expanded={showSpecificSpendCalculator}
          >
            <span className="summary-board__icon" aria-hidden="true">🧮</span>
            <div className="summary-board__text">
              <span className="summary-board__label">특정 지출 계산기</span>
              <span className="summary-board__value mono">
                {calculatorAmount.toLocaleString('ko-KR')}원
              </span>
              <span className="summary-board__unit summary-board__value-caption">이번 달</span>
            </div>
            <span className="summary-board__chevron" aria-hidden="true">{showSpecificSpendCalculator ? '▲' : '▾'}</span>
          </button>
        </div>
      )}

      {showSpendingDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">📋 {currentMonthNum}월 예상지출 내역</p>
            {spendingByDate.length === 0 ? (
              <p className="spending-detail__empty">
                금액이 등록된 항목이 없어요. 항목을 "수정"해서 금액을 입력하면 여기 반영돼요.
              </p>
            ) : (
              <>
                <div className="spending-detail__by-date">
                  {spendingByDate.map((group) => (
                    <div className="spending-detail__date-group" key={group.date}>
                      <p className="spending-detail__date-heading">
                        {formatKoreanMonthDay(group.date)}{' '}
                        <span className="mono">{group.total.toLocaleString('ko-KR')}원</span>
                      </p>
                      <ul className="spending-detail__list">
                        {group.items.map((item) => (
                          <li key={item.key}>
                            <span>
                              {item.itemName}
                              <span className="spending-detail__list-type">
                                {isRecurringType(item.type) ? '정기' : TYPE_SHORT_LABEL[item.type]}
                              </span>
                            </span>
                            <span className="mono">{item.amount.toLocaleString('ko-KR')}원</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="spending-detail__total">
                  {currentMonthNum}월 총 지출{' '}
                  <span className="mono">{monthlySpendEstimate.toLocaleString('ko-KR')}원</span>
                </p>
              </>
            )}
          </div>

          {categoryCounts.length > 0 && (
            <div className="spending-detail__section">
              <p className="spending-detail__heading">🗂 카테고리별 분석</p>
              <ul className="spending-detail__category-list">
                {categoryCounts.map(({ category: cat, count, amount }) => (
                  <li key={cat}>
                    <span>
                      {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat]}
                    </span>
                    <span className="spending-detail__category-stats">
                      <span className="mono">{count}개</span>
                      <span className="mono">{amount.toLocaleString('ko-KR')}원</span>
                    </span>
                  </li>
                ))}
              </ul>
              {uncategorizedSpendCount > 0 && (
                <p className="spending-detail__hint">
                  카테고리 미지정 <span className="mono">{uncategorizedSpendCount}</span>건 — 항목을 수정해서
                  카테고리를 지정해보세요.
                </p>
              )}
            </div>
          )}

        </div>
      )}

      {showYearlyDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section spending-detail__section--yearly">
            <p className="spending-detail__heading">📈 올해 예상 지출 — 월별 내역</p>
            <ul className="spending-detail__month-list">
              {monthlySpendDetails.map(({ month, total, trend, percentLabel, isFuture }) => (
                <li
                  key={month}
                  className={`spending-detail__month-item${
                    month === currentMonthNum ? ' spending-detail__month-item--current' : ''
                  }`}
                >
                  <span>{month}월</span>
                  <span className="mono">{total.toLocaleString('ko-KR')}원</span>
                  <span
                    className={`spending-detail__month-change ${
                      isFuture ? 'spending-detail__month-change--neutral' : `spending-detail__month-change--${trend}`
                    }`}
                  >
                    {percentLabel}
                  </span>
                </li>
              ))}
            </ul>
            <p className="spending-detail__total">
              올해 예상 지출{' '}
              <span className="mono">{yearlySpendEstimate.toLocaleString('ko-KR')}원</span>
            </p>
          </div>
        </div>
      )}

      {showRecurringDeliveryDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">📦 정기배송 현황</p>
            {recurringDeliveryGroups.length === 0 ? (
              <p className="spending-detail__empty">등록된 정기배송이 없어요.</p>
            ) : (
              recurringDeliveryGroups.map((group) => (
                <div className="spending-detail__date-group" key={group.category}>
                  <p className="spending-detail__date-heading">
                    {group.category === 'UNCATEGORIZED' ? '🗂 미지정' : `${CATEGORY_ICON[group.category]} ${CATEGORY_LABEL[group.category]}`}
                  </p>
                  <ul className="spending-detail__list">
                    {group.items.map((p) => (
                      <li key={p.id}>
                        <span>
                          {p.itemName}
                          <span className="spending-detail__list-type">
                            {formatKoreanMonthDay(p.deadline)} · {p.deliveryRound}회차
                          </span>
                        </span>
                        <span className="mono">{p.amount !== null ? `${p.amount.toLocaleString('ko-KR')}원` : '-'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showSubscriptionDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">🔄 정기구독 현황</p>
            {subscriptionGroups.length === 0 ? (
              <p className="spending-detail__empty">등록된 정기구독이 없어요.</p>
            ) : (
              subscriptionGroups.map((group) => (
                <div className="spending-detail__date-group" key={group.category}>
                  <p className="spending-detail__date-heading">
                    {group.category === 'UNCATEGORIZED' ? '🗂 미지정' : `${CATEGORY_ICON[group.category]} ${CATEGORY_LABEL[group.category]}`}
                  </p>
                  <ul className="spending-detail__list">
                    {group.items.map((p) => (
                      <li key={p.id}>
                        <span>
                          {p.itemName}
                          <span className="spending-detail__list-type">
                            {p.discontinuedAt !== null
                              ? `${p.deliveryRound}회차 (유지 안 함)`
                              : p.isOneTime
                                ? `${formatKoreanMonthDay(p.deadline)} · 한 번만 사용`
                                : `${formatKoreanMonthDay(p.deadline)} · ${p.deliveryRound}회차`}
                          </span>
                        </span>
                        <span className="mono">{p.amount !== null ? `${p.amount.toLocaleString('ko-KR')}원` : '-'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showPriceStatusDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">
              🟢 정상 <span className="mono">{normalItems.length}</span>건
            </p>
            <p className="spending-detail__hint">가격 변동 없음.</p>
          </div>

          {priceUpItems.length > 0 && (
            <div className="spending-detail__section">
              <p className="spending-detail__heading">
                🟡 가격 인상 <span className="mono">{priceUpItems.length}</span>건
              </p>
              <ul className="spending-detail__save-list">
                {priceUpItems.map((p) => (
                  <li key={p.id}>
                    <div className="spending-detail__save-item-info">
                      <p className="spending-detail__save-item-name">{p.itemName}</p>
                      <p className="spending-detail__save-item-reason">
                        확인 대기 목록에서 인상분을 확인해보세요.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unusedItems.length > 0 && (
            <div className="spending-detail__section">
              <p className="spending-detail__heading">
                🔴 사용 안 함 <span className="mono">{unusedItems.length}</span>건
              </p>
              <ul className="spending-detail__save-list">
                {unusedItems.map((p) => (
                  <li key={p.id}>
                    <div className="spending-detail__save-item-info">
                      <p className="spending-detail__save-item-name">{p.itemName}</p>
                      <p className="spending-detail__save-item-reason">
                        {p.discontinuedAt !== null
                          ? '유지 안 함으로 표시했어요.'
                          : '최근 이용 상태가 확인되지 않았습니다. 계속 쓰고 계신다면 "유지하기"를 눌러주세요.'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showSpecificSpendCalculator && (
        <div className="spending-detail specific-spend-calculator">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">🧮 특정 지출 계산기</p>
            <p className="spending-detail__hint">카테고리를 고르면 해당 항목만 자동으로 걸러집니다. 이어서 필요한 항목만 선택해 이번 달 예상 지출을 계산하세요.</p>

            <div className="specific-spend-calculator__types" role="group" aria-label="지출 유형 필터">
              <button
                type="button"
                className={calculatorType === 'ALL' ? 'is-active' : ''}
                onClick={() => { setCalculatorType('ALL'); setCalculatorCategories([]); setCalculatorSelectedItemIds([]); }}
              >전체 유형</button>
              {PURCHASE_TYPES.map((purchaseType) => (
                <button
                  type="button"
                  key={purchaseType}
                  className={calculatorType === purchaseType ? 'is-active' : ''}
                  onClick={() => { setCalculatorType(purchaseType); setCalculatorCategories([]); setCalculatorSelectedItemIds([]); }}
                >{TYPE_SHORT_LABEL[purchaseType]}</button>
              ))}
            </div>

            <div className="specific-spend-calculator__selection-bar">
              <span>표시된 항목 선택</span>
              <div>
                <button type="button" onClick={() => setCalculatorSelectedItemIds(calculatorCategoryFiltered.map((item) => item.id))}>전체 선택</button>
                <button type="button" onClick={() => setCalculatorSelectedItemIds([])}>전체 해제</button>
              </div>
            </div>

            <div className="specific-spend-calculator__categories" aria-label="카테고리 필터">
              {calculatorAvailableCategories.map((cat) => {
                const checked = calculatorCategories.length === 0 || calculatorCategories.includes(cat);
                return (
                  <label key={cat} className={`notification-day-option${checked ? ' notification-day-option--active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCalculatorCategories((current) => {
                          const next = current.length === 0
                            ? PURCHASE_CATEGORIES.filter((item) => item !== cat)
                            : current.includes(cat)
                              ? current.filter((item) => item !== cat)
                              : [...current, cat];
                          return next.length === PURCHASE_CATEGORIES.length ? [] : next;
                        });
                        setCalculatorSelectedItemIds([]);
                      }}
                    />
                    {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat]}
                  </label>
                );
              })}
            </div>

            <div className="specific-spend-calculator__items">
              {calculatorCategoryFiltered.length === 0 ? (
                <p className="spending-detail__empty">선택한 카테고리에 금액이 등록된 활성 항목이 없어요.</p>
              ) : (
                calculatorCategoryFiltered.map((p) => {
                  const checked = calculatorSelectedItemIds.includes(p.id);
                  const itemAmount = isRecurringType(p.type)
                    ? occurrencesInMonth(p, currentYearNum, currentMonthNum) * p.amount!
                    : p.baseDate.startsWith(`${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}`) ? p.amount! : 0;
                  return (
                    <label key={p.id} className="specific-spend-calculator__item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setCalculatorSelectedItemIds((current) =>
                          current.includes(p.id) ? current.filter((id) => id !== p.id) : [...current, p.id]
                        )}
                      />
                      <span>{p.itemName}{p.category && <small>{CATEGORY_ICON[p.category]} {CATEGORY_LABEL[p.category]}</small>}</span>
                      <strong className="mono">{itemAmount.toLocaleString('ko-KR')}원</strong>
                    </label>
                  );
                })
              )}
            </div>
            <p className="spending-detail__total">
              <span>선택한 {calculatorSelectedItems.length}건의 {currentMonthNum}월 예상 지출</span>
              <span className="mono">{calculatorAmount.toLocaleString('ko-KR')}원</span>
            </p>
          </div>
        </div>
      )}

      {showSavingsDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">💡 절약 제안</p>
            {reviewCandidates.length === 0 ? (
              <p className="spending-detail__empty">
                절약 제안할 항목이 없어요 — 유지 안 함으로 표시했거나 3회차 이상 확인이 안 된
                구독/정기배송이 없습니다.
              </p>
            ) : (
              <>
                <ul className="spending-detail__save-list">
                  {reviewCandidates.map((item) => (
                    <li key={item.id}>
                      <div className="spending-detail__save-item-info">
                        <p className="spending-detail__save-item-name">{item.itemName}</p>
                        <p className="spending-detail__save-item-reason">
                          {item.isExplicit
                            ? '유지 안 함으로 표시했어요 — 해지를 진행해보세요.'
                            : `${item.missedRounds}회차 연속 확인이 안 됐어요 — 최근 이용 상태가 확인되지 않았습니다. 계속 쓰고 계신다면 "유지하기"를 눌러주세요.`}
                        </p>
                      </div>
                      <span className="mono spending-detail__save-item-amount">월 {item.monthly.toLocaleString('ko-KR')}원</span>
                    </li>
                  ))}
                </ul>
                <p className="spending-detail__total">
                  {currentMonthNum}월 약 <span className="mono">{savingsEstimate.toLocaleString('ko-KR')}원</span>을 절약할 수 있어요
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 월/연 예상지출 상세 패널 바로 아래가 기본 위치 — 예전엔 소비요약 타일 줄 맨 끝에
          있어서, 저 상세를 펼치면 그 위에 걸쳐 있는 게 어색했다. */}
      {purchasesLoaded && purchases.length > 0 && !isPremium && (
        <Link
          to="/pricing"
          className="ai-summary-section summary-board__tile summary-board__tile--ai-summary summary-board__tile--clickable"
        >
          <span className="summary-board__icon" aria-hidden="true">🤖</span>
          <div className="summary-board__text">
            <span className="summary-board__label">AI 소비 매니저</span>
            <span className="summary-board__ai-cta">🔒 프리미엄으로 업그레이드하면 이용할 수 있어요</span>
          </div>
        </Link>
      )}

      {purchasesLoaded && purchases.length > 0 && isPremium && (
        <div
          className="ai-summary-section summary-board__tile summary-board__tile--ai-summary summary-board__tile--clickable"
        >
          {aiBrief ? (
            <div className="ai-brief">
              <div className="ai-brief__header">
                <button type="button" className="ai-brief__header-toggle" onClick={() => setAiBrief(null)} aria-label="AI 소비 매니저 접기">
                  <span>🤖 AI 소비 매니저 <span className="ai-brief__header-sub">· 오늘의 브리핑</span></span>
                  <span aria-hidden="true">⌃</span>
                </button>
                <button type="button" className="ai-brief__refresh" onClick={handleAiSummary} disabled={aiBriefTextLoading}>
                  {aiBriefTextLoading ? '분석 중...' : '↻ 다시 분석'}
                </button>
              </div>
              <div className="ai-brief__divider" />
              {/* "AI가 매기는 점수"처럼 보이지만 실제로는 가격 인상/미사용 의심/지출 급증/과다구독
                  신호를 규칙으로 점수화한 결정론적 지수 — computeHealthScore 참고. */}
              <div className="ai-brief__health">
                <span
                  className={`ai-brief__health-badge${
                    aiBrief.healthScore >= 80
                      ? ' ai-brief__health-badge--good'
                      : aiBrief.healthScore >= 50
                        ? ' ai-brief__health-badge--warn'
                        : ' ai-brief__health-badge--bad'
                  }`}
                >
                  {aiBrief.healthScore >= 80 ? '🟢 매우 양호' : aiBrief.healthScore >= 50 ? '🟡 보통' : '🔴 점검 필요'}
                </span>
                <span className="ai-brief__health-label">소비 건강도</span>
                <strong className="ai-brief__health-score">{aiBrief.healthScore}점</strong>
              </div>
              <div className="ai-brief__metrics">
                <div className="ai-brief__metric">
                  <span className="ai-brief__metric-label">💰 이번 달 예상</span>
                  <strong className="ai-brief__metric-value">{aiBrief.monthlySpend.toLocaleString('ko-KR')}원</strong>
                </div>
                <div className="ai-brief__metric">
                  <span className="ai-brief__metric-label">📦 구독 수</span>
                  <strong className="ai-brief__metric-value">{aiBrief.totalRecurring}개</strong>
                </div>
                {aiBrief.trendPct !== null && (
                  <div className="ai-brief__metric">
                    <span className="ai-brief__metric-label">📈 전월 대비</span>
                    <strong className={`ai-brief__metric-value${aiBrief.trendPct > 0 ? ' ai-brief__metric-value--up' : ' ai-brief__metric-value--down'}`}>
                      {aiBrief.trendPct > 0 ? '+' : ''}{aiBrief.trendPct}%
                    </strong>
                  </div>
                )}
                {aiBrief.topCategory && (
                  <div className="ai-brief__metric">
                    <span className="ai-brief__metric-label">🏆 최다 지출 카테고리</span>
                    <strong className="ai-brief__metric-value ai-brief__metric-value--cat">
                      {aiBrief.topCategory}
                    </strong>
                    <span className="ai-brief__metric-cat-amount">
                      {(aiBrief.topCategoryAmount ?? 0).toLocaleString('ko-KR')}원
                    </span>
                  </div>
                )}
              </div>
              {/* AI가 지어낸 문장이 아니라 실제 데이터로 계산한 사실 그대로(결정론적) — 날짜·
                  서비스명·건수처럼 틀리면 안 되는 값은 여기서 직접 채운다. */}
              <div className="ai-brief__checklist">
                <div className="ai-brief__check">
                  <span className={`ai-brief__check-mark${aiBrief.priceIncreaseItems.length > 0 ? ' ai-brief__check-mark--warn' : ''}`}>
                    {aiBrief.priceIncreaseItems.length > 0 ? '⚠' : '✔'}
                  </span>
                  <span className="ai-brief__check-label">가격 인상</span>
                  <span className="ai-brief__check-detail">
                    {aiBrief.priceIncreaseItems.length > 0 ? aiBrief.priceIncreaseItems.join(', ') : '없음'}
                  </span>
                </div>
                <div className="ai-brief__check">
                  <span className={`ai-brief__check-mark${aiBrief.unusedServiceItems.length > 0 ? ' ai-brief__check-mark--warn' : ''}`}>
                    {aiBrief.unusedServiceItems.length > 0 ? '⚠' : '✔'}
                  </span>
                  <span className="ai-brief__check-label">이용 상태 확인 필요</span>
                  <span className="ai-brief__check-detail">
                    {aiBrief.unusedServiceItems.length > 0 ? aiBrief.unusedServiceItems.join(', ') : '없음'}
                  </span>
                </div>
                <div className="ai-brief__check">
                  <span className="ai-brief__check-mark">🎯</span>
                  <span className="ai-brief__check-label">다음 확인 서비스</span>
                  <span className="ai-brief__check-detail">
                    {aiBrief.nextPaymentItem && aiBrief.nextPaymentDDay !== null ? (
                      <>
                        {aiBrief.nextPaymentItem} (
                        {aiBrief.nextPaymentDDay <= 0 ? '오늘' : aiBrief.nextPaymentDDay === 1 ? '내일' : `${aiBrief.nextPaymentDDay}일 후`} 결제)
                      </>
                    ) : (
                      '예정된 결제 없음'
                    )}
                  </span>
                </div>
                <div className="ai-brief__check">
                  <span className={`ai-brief__check-mark${aiBrief.savingsEstimate > 0 ? ' ai-brief__check-mark--warn' : ''}`}>
                    {aiBrief.savingsEstimate > 0 ? '💡' : '✔'}
                  </span>
                  <span className="ai-brief__check-label">이번 달 절약 가능성</span>
                  <span className="ai-brief__check-detail">
                    {aiBrief.savingsEstimate > 0 ? `약 ${aiBrief.savingsEstimate.toLocaleString('ko-KR')}원` : '없음'}
                  </span>
                </div>
                {aiBrief.nextPaymentItem && (
                  <p className="ai-brief__checklist-hint">
                    자동 결제를 유지할지 확인해보세요 — 가격 변동이 있었다면 확인 대기 목록에서 함께 볼 수 있어요.
                  </p>
                )}
              </div>
              {aiBriefTextLoading ? (
                <div className="ai-brief__text-loading">AI 분석 중...</div>
              ) : (
                <>
                  <div className="ai-brief__section">
                    <span className="ai-brief__section-label">🤖 AI 분석 결과</span>
                    <p className="ai-brief__section-text">{aiBrief.goodNews ?? '—'}</p>
                  </div>
                  <div className="ai-brief__section">
                    <span className="ai-brief__section-label">👀 눈여겨볼 점</span>
                    <p className="ai-brief__section-text">{aiBrief.attention ?? '특별한 주의사항 없음'}</p>
                  </div>
                  {aiBrief.insight && (
                    <div className="ai-brief__insight">💡 {aiBrief.insight}</div>
                  )}
                </>
              )}
            </div>
          ) : (
            <button type="button" className="ai-summary-section__trigger" onClick={handleAiSummary}>
              <span className="summary-board__icon" aria-hidden="true">🤖</span>
              <div className="summary-board__text">
                <span className="summary-board__label">AI 소비 매니저</span>
                <span className="summary-board__ai-cta">눌러서 소비 패턴 분석하기</span>
              </div>
            </button>
          )}
        </div>
      )}

      {isPremium && (weeklyDeliveries.length > 0 || weeklySubscriptions.length > 0) && (
        <WeeklySummaryBanner deliveries={weeklyDeliveries} subscriptions={weeklySubscriptions} />
      )}

      <ArrivalCheckSection
        purchases={arrivalChecks}
        snoozedCount={arrivalSnoozedCount}
        submittingId={dashboardArrivalSubmittingId}
        daysAgoById={dashboardArrivalDaysAgo}
        setDaysAgoById={setDashboardArrivalDaysAgo}
        onConfirm={handleDashboardArrivalConfirm}
        onSnooze={handleDashboardArrivalSnooze}
      />

      {/* 하나씩 누르는 게 불편하다는 피드백으로 추가한 일괄 확인 패널 — 확인이 안 됐다고 바로
          "사용 안 함"으로 단정하지 않고 순화된 문구("확인이 필요합니다")로, 색도 빨간색이 아니라
          노란색으로 둔다. 진짜 절약 후보(3회차 이상 미확인/유지 안 함)로 넘어가는 건 다른 곳에서
          별도로(🔴) 표시한다. */}
      {needsConfirmationItems.length > 0 && (
        <div className="confirm-needed-section">
          <div className="confirm-needed-section__header">
            <span className="confirm-needed-section__title">
              🟡 확인이 필요한 항목이 있습니다 <span className="mono">{needsConfirmationItems.length}</span>건
            </span>
            <button type="button" className="btn btn-sm" onClick={handleConfirmAll}>
              전체 확인
            </button>
          </div>
          <ul className="confirm-needed-section__list">
            {needsConfirmationItems.map((p) => (
              <li key={p.id}>
                <span className="confirm-needed-section__name">
                  {p.itemName}
                  <span className="confirm-needed-section__rounds">{missedRoundsFor(p)}회차 미확인</span>
                </span>
                <span className="confirm-needed-section__actions">
                  <button type="button" className="btn-text" onClick={() => handleMarkDelivered(p.id)}>
                    유지하기
                  </button>
                  <button
                    type="button"
                    className="btn-text confirm-needed-section__discontinue"
                    onClick={() => handleDiscontinue(p.id)}
                  >
                    유지 안 함
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmAllMessage && <p className="confirm-needed-section__success">✅ {confirmAllMessage}</p>}

      {urgent.length > 0 && (
        <div className={`urgent-banner${urgentAllHandled ? ' urgent-banner--ok' : ''}`}>
          <span className={`urgent-banner__tag${urgentAllHandled ? ' urgent-banner__tag--ok' : ''}`}>
            {urgentAllHandled ? '✓' : '⚠'} 7일 이내 {urgentAllHandled ? '배송 예정' : '마감'}{' '}
            <span className="mono">{urgent.length}</span>건
            {urgentAllHandled && ' — 오늘 확인 완료'}
          </span>
          <ul>
            {urgent.map((p) => (
              <li key={p.id}>
                {p.itemName} — {primaryDeadlineLabel(p)} <span className="mono">{p.deadline}</span>
                {isFullyConfirmed(p) && <span className="confirm-badge confirm-badge--sm">✓ 확인완료</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingItems.length > 0 && (
        <div className="pending-section">
          <p className="pending-section__title">
            📥 확인 대기 중인 항목 <span className="mono">{pendingItems.length}</span>건
          </p>
          <div className="pending-list">
            {pendingItems.map((item) => {
              const isPriceChange = item.matchedPurchaseId !== null && item.previousAmount !== null && item.amount !== null;
              return (
              <div className={`pending-card${isPriceChange ? ' pending-card--price-change' : ''}`} key={item.id}>
                <div className="pending-card__body">
                  <div className="pending-card__heading">
                    {item.brand && <BrandAvatar brand={item.brand} />}
                    <div className="pending-card__heading-text">
                      {item.brand && <span className="brand-kicker">{item.brand}</span>}
                      <p className="pending-card__name">
                        <span className={`type-dot type-dot--${item.type}`} aria-hidden="true" />
                        {item.itemName ?? '(상품명 미확인)'}
                        <span className={`pending-card__type pending-card__type--${item.type}`}>
                          {TYPE_SHORT_LABEL[item.type]}
                        </span>
                      </p>
                    </div>
                  </div>
                  {isPriceChange && (
                    <p className="pending-card__price-change">
                      ⚠ 가격 인상 감지 — <span className="mono">{item.previousAmount!.toLocaleString('ko-KR')}원</span>
                      {' → '}
                      <span className="mono">{item.amount!.toLocaleString('ko-KR')}원</span>{' '}
                      <span className="pending-card__price-change-delta">
                        (+{(item.amount! - item.previousAmount!).toLocaleString('ko-KR')}원)
                      </span>
                      <FxHint
                        originalAmount={item.originalAmount}
                        originalCurrency={item.originalCurrency}
                        exchangeRate={item.exchangeRate}
                      />
                      {item.originalCurrency && (
                        <span className="pending-card__price-change-hint">
                          {' '}
                          — 실제 정가가 아니라 환율 변동 때문일 수도 있어요.
                        </span>
                      )}
                    </p>
                  )}
                  <p className="pending-card__meta">
                    {isRecurringType(item.type) ? (
                      <>
                        {item.scheduleType === 'FIXED_DAY' && item.fixedDayOfMonth !== null ? (
                          <>매월 <span className="mono">{item.fixedDayOfMonth}일</span> 고정</>
                        ) : item.intervalDays !== null ? (
                          <>배송주기 <span className="mono">{item.intervalDays}일마다</span></>
                        ) : null}
                        {item.expectedDeliveryDate && (
                          <>
                            {(item.scheduleType === 'FIXED_DAY' ? item.fixedDayOfMonth !== null : item.intervalDays !== null) && ' · '}
                            다음배송 <span className="mono">{item.expectedDeliveryDate}</span>
                          </>
                        )}
                        {item.orderDate && (
                          <>
                            {(item.scheduleType === 'FIXED_DAY' ? item.fixedDayOfMonth !== null : item.intervalDays !== null || item.expectedDeliveryDate) && ' · '}
                            신청일 <span className="mono">{item.orderDate}</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {item.orderDate && (
                          <>주문일 <span className="mono">{item.orderDate}</span></>
                        )}
                        {item.returnDeadlineDays !== null && (
                          <>
                            {item.orderDate && ' · '}
                            반품기한 <span className="mono">{item.returnDeadlineDays}일</span>
                          </>
                        )}
                        {item.warrantyMonths !== null && (
                          <>
                            {(item.orderDate || item.returnDeadlineDays !== null) && ' · '}
                            A/S보증 <span className="mono">{item.warrantyMonths}개월</span>
                          </>
                        )}
                        {item.expectedDeliveryDate && (
                          <>
                            {(item.orderDate || item.returnDeadlineDays !== null || item.warrantyMonths !== null) && ' · '}
                            예상배송일 <span className="mono">{item.expectedDeliveryDate}</span>
                          </>
                        )}
                      </>
                    )}
                  </p>
                  {((!isPriceChange && item.amount !== null) || item.category) && (
                    <p className="pending-card__meta">
                      {!isPriceChange && item.amount !== null && (
                        <>
                          금액 <span className="mono">{item.amount.toLocaleString('ko-KR')}원</span>
                          <FxHint
                            originalAmount={item.originalAmount}
                            originalCurrency={item.originalCurrency}
                            exchangeRate={item.exchangeRate}
                          />
                          {item.category && ' · '}
                        </>
                      )}
                      {item.category && `${CATEGORY_ICON[item.category]} ${CATEGORY_LABEL[item.category]}`}
                    </p>
                  )}
                  {item.type === 'GENERAL' && (
                    <p className="pending-card__hint">
                      환불 및 A/S 정보는 정확히 인식되지 않을 수 있어요. 스토어 페이지에서 직접 확인해 주세요.
                    </p>
                  )}
                  {isRecurringType(item.type) && item.scheduleEstimated && (
                    <p className="pending-card__hint">
                      주기가 명확히 적혀있지 않아 30일마다로 추정했어요 — 정확한 주기를 확인해주세요.
                    </p>
                  )}
                </div>
                <div className="pending-card__actions">
                  {isPriceChange ? (
                    <button type="button" className="btn btn-sm" onClick={() => handleApplyPriceChange(item.id)}>
                      가격 반영
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={() => handlePendingRegisterClick(item)}>
                      확인 후 바로 등록
                    </button>
                  )}
                  <button type="button" className="btn-text" onClick={() => handleIgnorePending(item.id)}>
                    무시
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {!showRegisterForm ? (
        <button type="button" className="register-form__toggle" onClick={() => setShowRegisterForm(true)}>
          <span className="register-form__toggle-icon" aria-hidden="true">+</span> 새 항목 등록
        </button>
      ) : (
      <form className="register-form" onSubmit={handleSubmit}>
        <p className="register-form__title">
          {editingId !== null ? '항목 수정' : pendingConfirmId !== null ? '확인 대기 항목 등록' : '새 항목 등록'}
        </p>
        {/* 종류 + 항목명 — 이 폼의 "제목"에 해당하는 두 필드라 한 줄에서 항목명이 남는 폭을 다 가져간다. */}
        <div className="register-form__row">
          <div className="field field--narrow">
            <label htmlFor="type">종류</label>
            <div className="type-select-row">
              <span className={`type-dot type-dot--${type}`} aria-hidden="true" />
              <select id="type" value={type} onChange={(e) => setType(e.target.value as PurchaseType)}>
                <option value="GENERAL">일반 구매</option>
                <option value="RECURRING_DELIVERY">정기배송</option>
                <option value="SUBSCRIPTION">정기구독</option>
              </select>
            </div>
          </div>

          <div className="field field--wide">
            <label htmlFor="itemName">항목명</label>
            <input
              id="itemName"
              ref={itemNameInputRef}
              placeholder="예: 삼성 냉장고"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
          </div>
        </div>

        {/* 구매일/시작일 + 예상 도착일 — 둘 다 라벨+입력창 하나뿐인 균일한 높이라 나란히 둬도
            어긋나지 않는다. 도착일 안내는 더 이상 문단으로 아래에 펼쳐지지 않고, 라벨 옆 물음표
            아이콘에 마우스를 올리면 뜨는 툴팁(overlay)으로 대체했다 — 문구 길이가 타입마다 달라도
            레이아웃에 전혀 영향을 주지 않는다(field__help/field__tooltip 참고). */}
        <div className="register-form__row">
          <div className="field field--date">
            <label htmlFor="baseDate">
              {type === 'SUBSCRIPTION' ? '시작일' : '구매일'}
            </label>
            <input id="baseDate" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} required />
          </div>

          {type !== 'SUBSCRIPTION' && (
            <div className="field field--date">
              <label htmlFor="expectedDeliveryDate">
                예상 도착일{type === 'RECURRING_DELIVERY' ? ' (배송 주기 기준일)' : ''}
                <span className="field__help" tabIndex={0}>
                  <span className="field__help-icon" aria-hidden="true">?</span>
                  <span className="field__tooltip" role="tooltip">
                    {type === 'RECURRING_DELIVERY' &&
                      '비워두면 구매일을 기준으로 계산해요. 스토어가 안내한(또는 원하는) 첫 배송 도착일을 적으면 이후 회차가 그 날짜 기준으로 반복돼요.'}
                    {type === 'GENERAL' &&
                      '비워두면 구매일을 기준으로 계산해요. 적으면 반품기한(7일)·A/S 보증(1년)을 이 날짜부터 계산하고, 오늘부터 7일 안의 도착 예정일은 이번 주 배송 예정에도 표시돼요 — 자세한 환불 가능 날짜와 A/S 보증 만료일은 구매하신 스토어의 상세정보를 꼭 확인해주세요.'}
                  </span>
                </span>
              </label>
              <input
                id="expectedDeliveryDate"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* 금액 + 카테고리 — 모든 종류에 공통인 일반 필드. */}
        <div className="register-form__row register-form__row--payment">
          <div className="field field--amount">
            <label htmlFor="amount">
              금액(원)
              {originalCurrency && originalAmount !== null && ` (${formatOriginalAmount(originalAmount, originalCurrency)} 결제)`}
            </label>
            <input
              id="amount"
              type="text"
              inputMode="numeric"
              placeholder="선택 입력"
              value={amount}
              onChange={(e) => setAmount(formatAmountInput(e.target.value))}
            />
          </div>

          <div className="field field--narrow">
            <label htmlFor="category">카테고리</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value as PurchaseCategory)}>
              {PURCHASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 종류별 전용 필드 — GENERAL은 반품기한·A/S, 정기배송/구독은 스케줄 방식·주기. 둘 다
            체크박스/라디오 그룹에 field와 같은 캡션을 얹어서(field__static-label) 옆의 입력창과
            라벨 높이·베이스라인이 어긋나지 않게 맞춘다. */}
        {type === 'GENERAL' && (
          <div className="register-form__row">
            <div className="field field--narrow">
              <label htmlFor="returnDeadlineDays">반품기한(일)</label>
              <input
                id="returnDeadlineDays"
                type="number"
                value={returnDeadlineDays}
                onChange={(e) => setReturnDeadlineDays(e.target.value)}
              />
            </div>
            <div className="field field--narrow">
              <span className="field__static-label">전자제품</span>
              <label className="schedule-radio schedule-radio--field">
                <input
                  type="checkbox"
                  checked={isElectronics}
                  onChange={(e) => setIsElectronics(e.target.checked)}
                />
                A/S 보증도 추적
              </label>
            </div>
            {isElectronics && (
              <div className="field field--narrow">
                <label htmlFor="warrantyMonths">보증(개월)</label>
                <input
                  id="warrantyMonths"
                  type="number"
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
        {isRecurringType(type) && (
          <div className="register-form__row register-form__row--recurring">
            {scheduleType === 'INTERVAL' && (
              <div className="field field--narrow">
                <label htmlFor="intervalDays">주기(일)</label>
                <input
                  id="intervalDays"
                  type="number"
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(e.target.value)}
                />
              </div>
            )}
            {scheduleType === 'FIXED_DAY' && (
              <div className="field field--narrow">
                <label htmlFor="fixedDayOfMonth">매월 몇 일</label>
                <input
                  id="fixedDayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  value={fixedDayOfMonth}
                  onChange={(e) => setFixedDayOfMonth(e.target.value)}
                />
              </div>
            )}
            <div className="schedule-type-toggle" role="radiogroup" aria-label="스케줄 방식">
              <label className={`schedule-type-toggle__option${scheduleType === 'INTERVAL' ? ' schedule-type-toggle__option--active' : ''}`}>
                <input
                  type="radio"
                  name="scheduleType"
                  value="INTERVAL"
                  checked={scheduleType === 'INTERVAL'}
                  onChange={() => setScheduleType('INTERVAL')}
                />
                N일마다
              </label>
              <label className={`schedule-type-toggle__option${scheduleType === 'FIXED_DAY' ? ' schedule-type-toggle__option--active' : ''}`}>
                <input
                  type="radio"
                  name="scheduleType"
                  value="FIXED_DAY"
                  checked={scheduleType === 'FIXED_DAY'}
                  onChange={() => setScheduleType('FIXED_DAY')}
                />
                매월 N일 고정
              </label>
            </div>
            <label className="one-time-toggle">
              <input type="checkbox" checked={isOneTime} onChange={(e) => setIsOneTime(e.target.checked)} />
              <span>
                <strong>한 번만 사용</strong>
                <small>항목은 목록에 남기고, 다음 회차의 유지 확인과 예상 지출은 만들지 않아요.</small>
              </span>
            </label>
          </div>
        )}

        {type === 'GENERAL' && editingId === null && (
          <p className="register-form__hint">
            온라인 쇼핑·택배처럼 한 번 구매하고 배송받는 항목이에요. 도착 예정일을 입력하면 이번 주 배송 예정과 반품기한을 함께 챙겨드려요.
          </p>
        )}
        {type === 'RECURRING_DELIVERY' && editingId === null && (
          <p className="register-form__hint">
            생필품 정기배송처럼 일정한 주기로 실물 상품을 받아보는 항목이에요. 첫 배송 예정일과 주기를 입력하면 다음 배송일을 챙겨드려요.
          </p>
        )}
        {type === 'SUBSCRIPTION' && editingId === null && (
          <p className="register-form__hint">
            넷플릭스·도메인/호스팅 갱신·멤버십처럼 실물 배송 없이 정기결제되는 항목이에요.
          </p>
        )}

        <div className="register-form__actions">
          <button type="submit" className="btn">
            {editingId !== null ? '수정 완료' : '등록'}
          </button>
          <button type="button" className="btn-text" onClick={handleCancelEdit}>
            {editingId !== null || pendingConfirmId !== null ? '취소' : '접기'}
          </button>
        </div>
        {errorMessage && <p className="form-error" style={{ marginTop: 12 }}>{errorMessage}</p>}
        {showPremiumUpsell && (
          <p className="premium-upsell" style={{ marginTop: 6 }}>
            ✨ 프리미엄으로 업그레이드하면 등록 개수 제한 없이 이용할 수 있어요.{' '}
            <Link to="/pricing">업그레이드하기 →</Link>
          </p>
        )}
      </form>
      )}

      <p className="register-form__hint register-form__hint--legend">
        항목을 치울 때 <strong>삭제</strong>와 <strong>취소</strong>는 달라요 — <strong>삭제</strong>는
        목록에서만 빠지고 이미 발생한 지출은 통계에 그대로 남아요(이미 받은 배송, 지난 결제 등).{' '}
        <strong>취소</strong>는 지출 기록까지 완전히 없어져요(잘못 등록했거나, 주문이 취소됐거나,
        환불받아서 지출로 칠 필요가 없는 경우에 써주세요).
      </p>

      <div className="view-tabs" role="tablist" aria-label="목록 종류">
        <button type="button" className={`view-tabs__btn${view === 'ACTIVE' ? ' view-tabs__btn--active' : ''}`} onClick={() => setView('ACTIVE')}>
          내 목록
        </button>
        <button type="button" className={`view-tabs__btn${view === 'OVERDUE' ? ' view-tabs__btn--active' : ''}`} onClick={() => setView('OVERDUE')}>
          지난 항목{overdueItems.length > 0 && <span className="mono"> {overdueItems.length}</span>}
        </button>
        <button type="button" className={`view-tabs__btn${view === 'ARCHIVED' ? ' view-tabs__btn--active' : ''}`} onClick={() => setView('ARCHIVED')}>
          보관함
        </button>
        {acceptedShares.length > 0 && (
          <button
            type="button"
            className={`view-tabs__btn${view === 'SHARED' ? ' view-tabs__btn--active' : ''}`}
            onClick={handleSelectSharedView}
          >
            공유받은 목록
          </button>
        )}
        {isPremium && view === 'ACTIVE' && (
          <div className="view-tabs__export">
            <button type="button" className="btn-text" disabled={exporting} onClick={() => handleExport('csv')}>
              CSV 내보내기
            </button>
            <button type="button" className="btn-text" disabled={exporting} onClick={() => handleExport('pdf')}>
              PDF 내보내기
            </button>
          </div>
        )}
      </div>

      {view === 'ACTIVE' && (
        <>
          <div className="type-filter" role="tablist" aria-label="종류별 필터">
            {FILTER_OPTIONS.map((opt) => {
              const count =
                opt.key === 'ALL' ? nonOverduePurchases.length : nonOverduePurchases.filter((p) => p.type === opt.key).length;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterType === opt.key}
                  key={opt.key}
                  className={`type-filter__btn${opt.key !== 'ALL' ? ` type-filter__btn--${opt.key}` : ''}${
                    filterType === opt.key ? ' type-filter__btn--active' : ''
                  }`}
                  onClick={() => {
                    setFilterType(opt.key);
                    setFilterCategory('ALL');
                    setPurchasesPage(1);
                  }}
                >
                  {opt.key !== 'ALL' && <span className={`type-dot type-dot--${opt.key}`} aria-hidden="true" />}
                  {opt.label}
                  <span className="mono type-filter__count">{count}</span>
                </button>
              );
            })}
          </div>

          {categoryFilterOptions.length > 0 && (
            <div className="type-filter type-filter--category" role="tablist" aria-label="카테고리별 필터">
              <button
                type="button"
                role="tab"
                aria-selected={filterCategory === 'ALL'}
                className={`type-filter__btn${filterCategory === 'ALL' ? ' type-filter__btn--active' : ''}`}
                onClick={() => {
                  setFilterCategory('ALL');
                  setPurchasesPage(1);
                }}
              >
                전체
              </button>
              {categoryFilterOptions.map((c) => {
                const count = purchases.filter(
                  (p) => p.type === filterType && (c === 'UNCATEGORIZED' ? p.category === null : p.category === c)
                ).length;
                return (
                  <button
                    type="button"
                    role="tab"
                    key={c}
                    aria-selected={filterCategory === c}
                    className={`type-filter__btn type-filter__btn--${c}${filterCategory === c ? ' type-filter__btn--active' : ''}`}
                    onClick={() => {
                      setFilterCategory(c);
                      setPurchasesPage(1);
                    }}
                  >
                    {c === 'UNCATEGORIZED' ? '🗂 미지정' : `${CATEGORY_ICON[c]} ${CATEGORY_LABEL[c]}`}
                    <span className="mono type-filter__count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="ticket-list">
            {pagedPurchases.map((p) => (
              <div className="ticket-card" key={p.id}>
                <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
                <div className="ticket-card__body">
                  <div className="ticket-card__type-row">
                    <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                    {renderCategoryBadge(p)}
                  </div>
                  <div className="ticket-card__heading">
                    {p.brand && <BrandAvatar brand={p.brand} />}
                    <div className="ticket-card__heading-text">
                      {p.brand && <span className="brand-kicker">{p.brand}</span>}
                      <h3 className="ticket-card__title">{p.itemName}</h3>
                    </div>
                  </div>
                  {isRecurringType(p.type) && p.deliveryRound !== null ? (
                    <p className="ticket-card__deadline">
                      다음 일정: <span className="mono">{p.deliveryRound}회차</span>
                      {p.scheduleType === 'FIXED_DAY' && p.fixedDayOfMonth !== null
                        ? ` · 매월 ${p.fixedDayOfMonth}일 (${formatShortDate(p.deadline)})`
                        : ` (${formatShortDate(p.deadline)})`}
                      {p.isOneTime && ' · 한 번만 사용'}
                    </p>
                  ) : (
                    renderGeneralDeadlineLines(p)
                  )}
                  {p.amount !== null && (
                    <p className="ticket-card__amount mono">
                      <PurchaseAmount
                        amount={p.amount}
                        originalAmount={p.originalAmount}
                        originalCurrency={p.originalCurrency}
                      />
                    </p>
                  )}
                  <div className="ticket-card__actions">
                    {deadlineNotificationsEnabled === true && p.type === 'GENERAL' && p.deadlineNotificationsDisabledAt === null && (
                      <button className="btn-text" onClick={() => handleDisableDeadlineNotifications(p.id)}>
                        기한 알림 끄기
                      </button>
                    )}
                    {isRecurringType(p.type) && !p.isOneTime && p.dDay <= 0 &&
                      (isFullyConfirmed(p) ? (
                        <span className="confirm-badge">✓ 확인완료</span>
                      ) : (
                        <button className="btn-text" onClick={() => handleMarkDelivered(p.id)}>
                          유지하기
                        </button>
                      ))}
                    <button className="btn-text" onClick={() => handleEditClick(p)}>
                      수정
                    </button>
                    {isPremium && (
                      <button className="btn-text" onClick={() => handleArchive(p.id)}>
                        보관
                      </button>
                    )}
                    <button className="btn-text" onClick={() => handleDiscard(p.id)}>
                      삭제
                    </button>
                    <button className="btn-text" onClick={() => handleDelete(p.id)}>
                      취소
                    </button>
                  </div>
                </div>
                <div className="ticket-card__perforation" aria-hidden="true" />
                <div className="ticket-card__stub">
                  <StampBadge dDay={p.dDay} seed={p.id} />
                </div>
              </div>
            ))}
          </div>

          {purchases.length === 0 && <p className="empty-state">등록된 항목이 없습니다.</p>}
          {purchases.length > 0 && nonOverduePurchases.length === 0 && (
            <p className="empty-state">전부 지난 항목으로 옮겨갔어요 — "지난 항목" 탭에서 확인하세요.</p>
          )}
          {nonOverduePurchases.length > 0 && displayedPurchases.length === 0 && (
            <p className="empty-state">해당 종류의 항목이 없습니다.</p>
          )}
          <Pagination page={safePurchasesPage} totalPages={purchasesTotalPages} onPageChange={setPurchasesPage} />
        </>
      )}

      {view === 'OVERDUE' && (
        <>
          <p className="register-form__hint" style={{ marginBottom: 14 }}>
            반품기한·A/S보증이 다 지난 일반구매, "유지 안 함"으로 표시한 정기배송·구독이 여기
            모여요 — 내 목록(전체)에는 안 보이지만 삭제하기 전까지는 계속 여기서 확인할 수 있고,
            삭제해도 이미 발생한 지출은 통계에 남아요.
          </p>
          {overdueItems.length > 0 && (
            <button type="button" className="btn btn-sm btn-outline" style={{ marginBottom: 14 }} onClick={handleDiscardAll}>
              전체 삭제 ({overdueItems.length}건)
            </button>
          )}
          <div className="ticket-list">
            {overdueItems.map((p) => (
              <div className="ticket-card" key={p.id}>
                <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
                <div className="ticket-card__body">
                  <div className="ticket-card__type-row">
                    <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                    {renderCategoryBadge(p)}
                  </div>
                  <div className="ticket-card__heading">
                    {p.brand && <BrandAvatar brand={p.brand} />}
                    <div className="ticket-card__heading-text">
                      {p.brand && <span className="brand-kicker">{p.brand}</span>}
                      <h3 className="ticket-card__title">{p.itemName}</h3>
                    </div>
                  </div>
                  {isRecurringType(p.type) && p.deliveryRound !== null ? (
                    <p className="ticket-card__deadline">
                      다음 일정: <span className="mono">{p.deliveryRound}회차</span>
                      {p.scheduleType === 'FIXED_DAY' && p.fixedDayOfMonth !== null
                        ? ` · 매월 ${p.fixedDayOfMonth}일 (${formatShortDate(p.deadline)})`
                        : ` (${formatShortDate(p.deadline)})`}
                    </p>
                  ) : (
                    renderGeneralDeadlineLines(p)
                  )}
                  {p.amount !== null && (
                    <p className="ticket-card__amount mono">
                      <PurchaseAmount
                        amount={p.amount}
                        originalAmount={p.originalAmount}
                        originalCurrency={p.originalCurrency}
                      />
                    </p>
                  )}
                  <div className="ticket-card__actions">
                    {isRecurringType(p.type) && p.discontinuedAt !== null && (
                      <button className="btn-text" onClick={() => handleMarkDelivered(p.id)}>
                        유지하기(재개)
                      </button>
                    )}
                    <button className="btn-text" onClick={() => handleEditClick(p)}>
                      수정
                    </button>
                    {isPremium && (
                      <button className="btn-text" onClick={() => handleArchive(p.id)}>
                        보관
                      </button>
                    )}
                    <button className="btn-text" onClick={() => handleDiscard(p.id)}>
                      삭제
                    </button>
                    <button className="btn-text" onClick={() => handleDelete(p.id)}>
                      취소
                    </button>
                  </div>
                </div>
                <div className="ticket-card__perforation" aria-hidden="true" />
                <div className="ticket-card__stub">
                  <StampBadge dDay={p.dDay} seed={p.id} />
                </div>
              </div>
            ))}
          </div>
          {overdueItems.length === 0 && <p className="empty-state">지난 항목이 없습니다.</p>}
        </>
      )}

      {view === 'ARCHIVED' && (
        <>
          <div className="ticket-list">
            {archivedPurchases.map((p) => (
              <div className="ticket-card ticket-card--archived" key={p.id}>
                <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
                <div className="ticket-card__body">
                  <div className="ticket-card__type-row">
                    <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                    {renderCategoryBadge(p)}
                  </div>
                  <h3 className="ticket-card__title">{p.itemName}</h3>
                  {isRecurringType(p.type) ? (
                    <p className="ticket-card__deadline">
                      {DEADLINE_LABEL[p.type]} · <span className="mono">{p.deadline}</span>
                    </p>
                  ) : (
                    renderGeneralDeadlineLines(p)
                  )}
                  <div className="ticket-card__actions">
                    <button className="btn-text" onClick={() => handleUnarchive(p.id)}>
                      복원
                    </button>
                    <button className="btn-text" onClick={() => handleDiscard(p.id)}>
                      삭제
                    </button>
                    <button className="btn-text" onClick={() => handleDelete(p.id)}>
                      취소
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {archivedPurchases.length === 0 && <p className="empty-state">보관된 항목이 없습니다.</p>}
        </>
      )}

      {view === 'SHARED' && (
        <>
          {acceptedShares.length > 1 && (
            <div className="type-filter" role="tablist" aria-label="공유한 사람 선택">
              {acceptedShares.map((share) => (
                <button
                  type="button"
                  key={share.id}
                  className={`type-filter__btn${selectedShareId === share.id ? ' type-filter__btn--active' : ''}`}
                  onClick={() => setSelectedShareId(share.id)}
                >
                  {share.counterpart}
                </button>
              ))}
            </div>
          )}
          <div className="ticket-list">
            {sharedPurchases.map((p) => (
              <div className="ticket-card" key={p.id}>
                <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
                <div className="ticket-card__body">
                  <div className="ticket-card__type-row">
                    <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                    {renderCategoryBadge(p)}
                  </div>
                  <h3 className="ticket-card__title">{p.itemName}</h3>
                  {isRecurringType(p.type) && p.deliveryRound !== null ? (
                    <p className="ticket-card__deadline">
                      다음 일정: <span className="mono">{p.deliveryRound}회차</span>
                      {p.scheduleType === 'FIXED_DAY' && p.fixedDayOfMonth !== null
                        ? ` · 매월 ${p.fixedDayOfMonth}일 (${formatShortDate(p.deadline)})`
                        : ` (${formatShortDate(p.deadline)})`}
                    </p>
                  ) : (
                    renderGeneralDeadlineLines(p)
                  )}
                </div>
                <div className="ticket-card__perforation" aria-hidden="true" />
                <div className="ticket-card__stub">
                  <StampBadge dDay={p.dDay} seed={p.id} />
                </div>
              </div>
            ))}
          </div>
          {sharedPurchases.length === 0 && <p className="empty-state">공유받은 항목이 없습니다.</p>}
        </>
      )}
    </div>
  );
}

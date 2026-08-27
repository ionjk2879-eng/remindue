import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmArrival, confirmArrivalBatch, confirmArrivalForPurchase, confirmRecurringBatch, snoozeArrivalForPurchase } from '../api/push';
import {
  createPurchase,
  updatePurchase,
  downloadExport,
} from '../api/purchases';
import { applyPriceChange, fetchPendingPurchases, confirmPendingPurchase, ignorePendingPurchase } from '../api/pendingPurchases';
import {
  completeOnboarding as apiCompleteOnboarding,
  fetchFxCardSettings,
  fetchNotificationDays,
  regenerateForwardingAddress,
  type FxCardBrand,
  type FxCardIssuer,
} from '../api/settings';
import { fetchSharedPurchases } from '../api/sharing';
import {
  isRecurringType,
  type PendingPurchase,
  type Purchase,
  type PurchaseCategory,
  type PurchaseType,
} from '../types';
import { useAuth } from '../context/AuthContext';
import StampBadge from '../components/StampBadge';
import PushPermissionBanner from '../components/PushPermissionBanner';
import OnboardingOverlay from '../components/OnboardingOverlay';
import Pagination from '../components/Pagination';
import ArrivalCheckSection from '../components/dashboard/ArrivalCheckSection';
import BrandAvatar from '../components/dashboard/BrandAvatar';
import { FxHint, PurchaseAmount } from '../components/dashboard/PurchaseMoney';
import WeeklySummaryBanner from '../components/dashboard/WeeklySummaryBanner';
import PurchaseListTabs, { type PurchaseListView } from '../features/dashboard/PurchaseListTabs';
import { usePendingPurchases } from '../features/dashboard/usePendingPurchases';
import { useDashboardPurchases } from '../features/dashboard/useDashboardPurchases';
import { usePurchaseForm } from '../features/dashboard/usePurchaseForm';
import {
  calculateCategoryItems,
  calculateCategorySpending,
  calculateSelectedSpend,
  calculateYearlySpending,
  computeSpendingByDate,
  selectCalculatorPurchases,
  type SpendingDateGroup,
} from '../features/dashboard/dashboardMetrics';
import { selectPurchaseList, selectPurchaseSignals } from '../features/dashboard/dashboardSelectors';
import { needsAttentionBadge, selectWeeklyDashboard } from '../features/dashboard/dashboardWeekly';
import { useAiBrief } from '../features/dashboard/useAiBrief';
import PurchaseForm from '../features/dashboard/PurchaseForm';
import AiBriefPanel from '../features/dashboard/AiBriefPanel';
import PendingPurchaseList from '../features/dashboard/PendingPurchaseList';
import DashboardConfirmationModals from '../features/dashboard/DashboardConfirmationModals';
import DashboardSummaryBoard from '../features/dashboard/DashboardSummaryBoard';
import { usePurchaseMutations } from '../features/dashboard/usePurchaseMutations';
import SharedPurchaseList from '../features/dashboard/SharedPurchaseList';
import ArchivedPurchaseList from '../features/dashboard/ArchivedPurchaseList';
import OverduePurchaseList from '../features/dashboard/OverduePurchaseList';
import ActivePurchaseList from '../features/dashboard/ActivePurchaseList';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  DEADLINE_LABEL,
  FILTER_OPTIONS,
  PURCHASE_CATEGORIES,
  PURCHASE_TYPES,
  TYPE_LABEL,
  TYPE_SHORT_LABEL,
  formatAmountInput,
  groupByCategory,
  isFullyConfirmed,
  missedRoundsFor,
  parseAmountInput,
  primaryDeadlineLabel,
  renderAmountChangeArrow,
  renderCategoryBadge,
  renderGeneralDeadlineLines,
  renderRecurringScheduleLine,
  type FilterType,
} from '../features/dashboard/dashboardModel';
import {
  daysSinceBaseDate,
  formatIntervalDaysLabel,
  formatKoreanMonthDay,
  formatShortDate,
  formatShortDateWithYear,
  currentCycleDeadline,
  occurrencesInMonth,
} from '../components/dashboard/dashboardUtils';


/**
 * "지난 항목" 판정 — GENERAL은 dDay<0(반품기한·A/S보증 다 지남)이면 해당된다. 정기배송/구독은
 * computeDeadline이 매일 오늘 기준으로 다음 회차를 다시 계산해서 dDay가 사실상 음수로 남지
 * 않으므로(자동으로 다음 회차로 넘어감), dDay만으로는 "갱신 안 됨"을 못 잡아낸다 —
 * discontinuedAt("유지 안 함")이 유일하게 믿을 수 있는 신호다.
 */
export default function DashboardPage() {
  /** 월별/연간 지출 집계 전용(활성+보관+삭제 전부 포함) — 카드로 렌더링하지 않는다. */
  /** RECURRING_DELIVERY 전용 스케줄 앵커("최초 도착(예정)일") — 비워두면 baseDate가 대신 앵커로
   *  쓰인다(서버 fallback). GENERAL도 입력 가능하지만 정보용일 뿐 계산에 영향 없다. */
  /** GENERAL 전용 — 체크하면 A/S 보증(개월) 필드가 추가로 노출되고 반품기한과 함께 등록된다. */
  /** RECURRING_DELIVERY 전용 — 결제일로부터 보통 영업일 며칠 후 도착하는지. 비워두면 도착예정을 표시하지 않는다. */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { forwardingEmail, setForwardingEmail, pendingItems, setPendingItems, refreshPending: loadPending } = usePendingPurchases();
  const [addressCopied, setAddressCopied] = useState(false);
  const [confirmAllMessage, setConfirmAllMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  /** 종류 필터가 'ALL'이 아닐 때만 노출되는 2차 필터 — 'UNCATEGORIZED'는 category가 null인 항목. */
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'UNCATEGORIZED' | PurchaseCategory>('ALL');
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [view, setView] = useState<PurchaseListView>('ACTIVE');
  const [selectedShareId, setSelectedShareId] = useState<number | null>(null);
  const [sharedPurchases, setSharedPurchases] = useState<Purchase[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deadlineNotificationsEnabled, setDeadlineNotificationsEnabled] = useState<boolean | null>(null);
  const [showSpendingDetail, setShowSpendingDetail] = useState(false);
  /** AI 소비 매니저의 "카드 최적화 제안"용 — 해외결제 항목이 트래블 카드였다면 얼마였을지
   *  추정하려면 사용자가 설정(해외결제 환율 계산 기준)에서 고른 현재 카드사/브랜드가 필요하다. */
  const [fxCardSettings, setFxCardSettings] = useState<{ fxCardIssuer: FxCardIssuer | null; fxCardBrand: FxCardBrand | null } | null>(null);
  const [showYearlyDetail, setShowYearlyDetail] = useState(false);
  const [selectedSpendMonth, setSelectedSpendMonth] = useState<number | null>(null);
  const [selectedSpendCategory, setSelectedSpendCategory] = useState<PurchaseCategory | null>(null);
  const [showSavingsDetail, setShowSavingsDetail] = useState(false);
  const [showSpecificSpendCalculator, setShowSpecificSpendCalculator] = useState(false);
  /** 카테고리를 고르지 않으면 전체 범위를 보여 주되, 계산할 항목은 기본으로 선택하지 않는다. */
  const [calculatorType, setCalculatorType] = useState<FilterType>('ALL');
  const [calculatorCategories, setCalculatorCategories] = useState<PurchaseCategory[]>([]);
  const [calculatorSelectedItemIds, setCalculatorSelectedItemIds] = useState<number[]>([]);
  const [showPriceStatusDetail, setShowPriceStatusDetail] = useState(false);
  const [showRecurringDeliveryDetail, setShowRecurringDeliveryDetail] = useState(false);
  const [showSubscriptionDetail, setShowSubscriptionDetail] = useState(false);
  const { nickname, hasSeenOnboarding, completeOnboarding } = useAuth();
  const purchaseForm = usePurchaseForm();
  const {
    purchases, setPurchases, spendHistoryPurchases, archivedPurchases, acceptedShares,
    purchasesLoaded, load, loadSpendHistory, loadArchived, loadAcceptedShares, applyPurchaseUpsert,
  } = useDashboardPurchases(nickname);
  const {
    editingId, pendingConfirmId, setPendingConfirmId, showRegisterForm, setShowRegisterForm,
    type, setType, itemName, setItemName, baseDate, setBaseDate,
    expectedDeliveryDate, setExpectedDeliveryDate, amount, setAmount,
    isElectronics, setIsElectronics, warrantyMonths, setWarrantyMonths,
    returnDeadlineDays, setReturnDeadlineDays, intervalDays, setIntervalDays,
    scheduleType, setScheduleType, fixedDayOfMonth, setFixedDayOfMonth,
    fixedDayIntervalMonths, setFixedDayIntervalMonths, arrivalOffsetDays, setArrivalOffsetDays,
    isOneTime, setIsOneTime, category, setCategory, categoryTags, setCategoryTags,
    brand, setBrand, brandDomain, setBrandDomain, originalAmount, setOriginalAmount, originalCurrency, setOriginalCurrency,
    exchangeRate, setExchangeRate, itemNameInputRef, resetForm, beginEdit,
  } = purchaseForm;

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

  /**
   * 등록/수정 응답으로 이미 받은 최신 Purchase를 캐시·상태에 바로 반영한다 — 등록·수정 직후
   * load()/loadSpendHistory()로 목록 전체를 다시 GET하지 않아도 되게 해서(서버가 이미 정확한
   * 값을 돌려줬으니 다시 물어볼 필요가 없다) 등록 체감 속도를 올린다. 새 항목이면 추가 후
   * dDay 기준으로 재정렬(서버 목록 조회와 같은 정렬 규칙), 기존 항목이면 해당 id만 교체한다.
   */
  useEffect(() => {
    fetchNotificationDays()
      .then((data) => setDeadlineNotificationsEnabled(data.notificationDays.length > 0))
      .catch(() => setDeadlineNotificationsEnabled(true));
    fetchFxCardSettings()
      .then(setFxCardSettings)
      .catch(() => setFxCardSettings(null));
  }, []);

  useEffect(() => {
    if (view === 'ARCHIVED') loadArchived();
  }, [view]);

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

  const handleEditClick = (p: Purchase) => {
    setErrorMessage(null);
    beginEdit(p);
    // 폼이 접혀있던 상태였다면 이 시점엔 아직 DOM에 없다 — 다음 페인트 이후로 미뤄서
    // itemNameInputRef가 실제로 붙은 뒤에 스크롤/포커스한다.
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
        if (item.arrivalOffsetDays !== null) setArrivalOffsetDays(String(item.arrivalOffsetDays));
      }
      if (item.type === 'RECURRING_DELIVERY') {
        // 정기배송은 달 단위(FIXED_DAY)가 기본 — 예상 도착일의 "일"을 고정일로 자동 채운다.
        setScheduleType('FIXED_DAY');
        const deliveryDay = item.expectedDeliveryDate
          ? parseInt(item.expectedDeliveryDate.split('-')[2], 10)
          : (item.fixedDayOfMonth ?? 1);
        setFixedDayOfMonth(String(deliveryDay));
        // AI가 추출한 intervalDays(일 단위)를 개월로 환산해 초기값으로 쓴다(부정확하면 수동 수정).
        // item.fixedDayIntervalMonths는 scheduleType이 실제로 FIXED_DAY였을 때만 AI가 준 값이고,
        // INTERVAL이었던 항목은 의미 없는 기본값 1이 그대로 채워져 있다(types/index.ts 주석 참고) —
        // 이걸 구분 없이 신뢰하면 60일 주기 같은 항목도 무조건 1개월로 잘못 프리필된다.
        const months = item.scheduleType === 'FIXED_DAY'
          ? item.fixedDayIntervalMonths
          : (item.intervalDays ? Math.max(1, Math.round(item.intervalDays / 30)) : 1);
        setFixedDayIntervalMonths(String(months));
      } else {
        const st = item.scheduleType ?? 'INTERVAL';
        setScheduleType(st);
        if (st === 'FIXED_DAY' && item.fixedDayOfMonth !== null) {
          setFixedDayOfMonth(String(item.fixedDayOfMonth));
          setFixedDayIntervalMonths(String(item.fixedDayIntervalMonths ?? 1));
        } else if (item.intervalDays !== null) {
          setIntervalDays(String(item.intervalDays));
        }
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

  /** 가격 변동 감지 카드의 "가격 반영" — 새 항목을 만들지 않고 매칭된 기존 항목의 금액만 갱신한다. */
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
      fixedDayIntervalMonths: isRecurringType(type) && scheduleType === 'FIXED_DAY' ? Number(fixedDayIntervalMonths) : undefined,
      arrivalOffsetDays: type === 'RECURRING_DELIVERY' && arrivalOffsetDays.trim() !== '' ? Number(arrivalOffsetDays) : null,
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
      setErrorMessage(
        editingId !== null ? '수정하지 못했습니다. 입력값을 확인해주세요.' : '등록하지 못했습니다. 입력값을 확인해주세요.'
      );
      console.error(err);
    }
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

  // 정기배송/구독은 dDay가 아니라 paymentDDay로 판정한다 — dDay는 결제완료·도착대기 상태일 때
  // 도착일 기준으로 바뀌어 있어서, 어제 결제됐지만 아직 안 도착한 항목까지 "결제 예정/마감"에
  // 잘못 잡히게 된다(실제로는 이미 결제가 끝난 상태).
  const {
    today,
    urgent,
    urgentAllHandled,
    weeklyDeliveries,
    weeklySubscriptions,
    weeklyPaymentCount,
    weeklyDeliveryEntries,
    weeklySubscriptionEntries,
    arrivalChecks,
    arrivalSnoozedCount,
  } = useMemo(() => selectWeeklyDashboard(purchases), [purchases]);

  /** 주간 요약 — 이번 주(오늘부터 7일 이내) 예정인 정기배송·구독 결제. */
  /**
   * "배송 예정" — GENERAL은 실제 도착일(expectedDeliveryDate)을 추적해 정확한 날짜로 보여준다.
   * RECURRING_DELIVERY는 정확한 도착일을 알 방법이 없으므로(스토어가 준 값도 실측 아님) 결제일
   * 기준 참고용 범위(arrivalRangeEstimate)가 이번 주에 걸치면 그 범위를 그대로 보여준다 —
   * "언제 받으셨어요?" 확인은 여전히 GENERAL 전용(arrival-confirm.ts)이고, RECURRING_DELIVERY는
   * 실제 수령 여부를 묻지 않은 채 추정 범위만 표시한다(WeeklySummaryBanner.tsx).
   */
  /**
   * 요약 카드에는 이번 주 월요일부터 오늘까지 이미 도래한 결제 회차만 센다.
   * 이번 주 후반의 예정 결제는 '결제 예정' 목록에만 남기고 완료 건수에는 넣지 않는다.
   */
  // "유지 안 함"을 누르면 정기 스케줄은 곧바로 다음 회차를 가리킬 수 있다. 그 때문에
  // 오늘/이번 주에 구독을 끝냈어도 예정일 필터만으로는 주간 티켓에서 빠진다. 처리한 주에는
  // 이력을 한 번 남겨야 사용자가 이번 주에 어떤 구독을 중단했는지 바로 알 수 있다.
    // "한 번만 사용"은 등록 시점에 다음 회차를 만들지 않도록 선택한 상태다. 따라서
    // 이번 주 구독 예정에서도 실제 유지 확인을 기다리는 것처럼 보이지 않게 유지 안 함으로 표시한다.
  /** 푸시를 놓쳐도 대시보드에서 답할 수 있는 오늘의 도착 확인 항목 — GENERAL 전용(도착 확인은
   *  더 이상 RECURRING_DELIVERY에 적용되지 않는다). */
  /**
   * 카드의 D-day 도장에 느낌표를 얹을지 — "유지하시겠어요?" 질문에 아직 응답하지 않은
   * 정기배송·구독만 대상이다. 일반구매의 반품기한/A·S보증은 이미 대시보드 다른 곳(7일 이내
   * 마감 등)에 따로 노출되고 있어서 여기서는 대상에서 뺀다.
   */
  /** 메인 요약 보드 — 활성 항목 기준. purchases는 archived 제외만 서버에서 걸러져 오고
   *  discardedAt(삭제)은 "지난 항목" 탭에 두려고 그대로 포함돼 있으므로 여기서 따로 걸러낸다. */
  const recurringDeliveryCount = purchases.filter((p) => p.type === 'RECURRING_DELIVERY' && p.discontinuedAt === null && p.discardedAt === null).length;
  const subscriptionCount = purchases.filter((p) => p.type === 'SUBSCRIPTION' && p.discontinuedAt === null && p.discardedAt === null).length;
  /** "정기배송"/"정기구독" 타일 상세 — 아래 목록과 달리 날짜순이 아니라 카테고리별로 묶어서 보여준다.
   *  삭제한 항목은 지난 항목 탭으로 옮겨갔으니 여기서도 제외한다. */
  const recurringDeliveryGroups = groupByCategory(purchases.filter((p) => p.type === 'RECURRING_DELIVERY' && p.discardedAt === null));
  const subscriptionGroups = groupByCategory(purchases.filter((p) => p.type === 'SUBSCRIPTION' && p.discardedAt === null));

  /** N일마다 항목은 30일 기준 월 환산액으로, 매월 특정일 고정 항목은 금액을 그대로 더한다. */
  const monthlyEquivalent = (p: Purchase): number =>
    p.scheduleType === 'FIXED_DAY' ? p.amount! : (p.amount! * 30) / (p.intervalDays || 30);

  const [currentYearNum, currentMonthNum] = today.split('-').map(Number);
  const [calculatorMonth, setCalculatorMonth] = useState(
    `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}`,
  );
  const [calculatorYearNum, calculatorMonthNum] = calculatorMonth.split('-').map(Number);

  /**
   * "이번 달 예상지출"/"올해 예상 지출" 월별 항목 클릭 시 보여주는 항목별 내역 — 정기배송/구독은
   * 해당 달에 실제로 결제되는 날짜마다 한 줄씩(같은 항목이 여러 번 결제되면 그만큼 여러 줄),
   * GENERAL 같은 1회성 결제도 baseDate가 그 달이면 그 날짜에 포함한다. 금액이 없는 항목은 제외.
   * 이번 달뿐 아니라 올해 예상 지출의 다른 달을 눌렀을 때도 재사용한다.
   */
  const { byDate: spendingByDate, total: monthlySpendEstimate } = useMemo(
    () => computeSpendingByDate(spendHistoryPurchases, currentYearNum, currentMonthNum),
    [spendHistoryPurchases, currentYearNum, currentMonthNum],
  );

  const selectedMonthSpending = useMemo(
    () => selectedSpendMonth !== null
      ? computeSpendingByDate(spendHistoryPurchases, currentYearNum, selectedSpendMonth)
      : null,
    [spendHistoryPurchases, currentYearNum, selectedSpendMonth],
  );

  /** "N월 예상지출 내역" 본문 — 이번 달 아코디언과 올해 예상 지출의 월별 팝업이 공유한다. */
  const renderMonthSpendingBody = (
    month: number,
    byDate: SpendingDateGroup[],
    total: number
  ) =>
    byDate.length === 0 ? (
      <p className="spending-detail__empty">
        금액이 등록된 항목이 없어요. 항목을 "수정"해서 금액을 입력하면 여기 반영돼요.
      </p>
    ) : (
      <>
        <div className="spending-detail__by-date">
          {byDate.map((group) => (
            <div className="spending-detail__date-group" key={group.date}>
              <p className="spending-detail__date-heading">
                {formatKoreanMonthDay(group.date)}{' '}
                <span className="mono">{group.total.toLocaleString('ko-KR')}원</span>
              </p>
              <ul className="spending-detail__list">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <span>
                      <span className={`spending-detail__list-type spending-detail__list-type--${item.type}`}>
                        {TYPE_SHORT_LABEL[item.type]}
                      </span>
                      {item.itemName}
                    </span>
                    <span className="mono">{item.amount.toLocaleString('ko-KR')}원</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="spending-detail__total">
          {month}월 총 지출{' '}
          <span className="mono">{total.toLocaleString('ko-KR')}원</span>
        </p>
      </>
    );

  /** 특정 지출 계산기: 선택한 달의 지출 이력에서 삭제하지 않은 항목만 고른다. */
  const calculatorCandidates = selectCalculatorPurchases(
    spendHistoryPurchases,
    calculatorYearNum,
    calculatorMonthNum,
  );
  const calculatorTypeFiltered = calculatorCandidates.filter(
    (p) => calculatorType === 'ALL' || p.type === calculatorType
  );
  const calculatorAvailableCategories = PURCHASE_CATEGORIES.filter((cat) =>
    calculatorTypeFiltered.some((p) => p.category === cat)
  );
  const calculatorCategoryFiltered = calculatorTypeFiltered.filter(
    (p) => calculatorCategories.length === 0 || (p.category !== null && calculatorCategories.includes(p.category))
  );
  const calculatorSelectedItems = calculatorCategoryFiltered.filter((p) => calculatorSelectedItemIds.includes(p.id));
  const calculatorAmount = calculateSelectedSpend(
    calculatorCategoryFiltered,
    calculatorSelectedItemIds,
    calculatorYearNum,
    calculatorMonthNum,
  );

  /** "올해 예상 지출" — 1~12월 각각의 실제 지출 총액(정기 결제 발생 횟수 + 1회성 결제)과 그 합계. */
  const {
    monthlyDetails: monthlySpendDetails,
    yearlyTotal: yearlySpendEstimate,
  } = useMemo(
    () => calculateYearlySpending(spendHistoryPurchases, currentYearNum, currentMonthNum),
    [spendHistoryPurchases, currentYearNum, currentMonthNum],
  );

  /**
   * 각 달을 전월 대비로 비교 — 1월은 작년 12월과 비교(연 경계도 실제 데이터로 계산). 아직 오지
   * 않은 달(이번 달보다 미래)은 "예상"일 뿐 실제 증감이라 부르기 애매해 색을 입히지 않는다
   * (isFuture=true). %는 전월 지출이 0원이면 나눗셈이 무의미해 "신규"로 대신 표시한다.
   */
  /**
   * "카테고리별 분석"은 요약 타일의 이번 달 예상 지출과 같은 기준이다. 정기배송·구독뿐 아니라
   * 이번 달에 발생하는 일반배송까지 포함해, 새로 등록한 모든 카테고리가 누락되지 않게 한다.
   */
  const {
    categoryCounts,
    uncategorizedCount: uncategorizedSpendCount,
  } = useMemo(
    () => calculateCategorySpending(spendHistoryPurchases, currentYearNum, currentMonthNum),
    [spendHistoryPurchases, currentYearNum, currentMonthNum],
  );

  /** "카테고리별 분석"의 카테고리 하나를 눌렀을 때 팝업으로 보여줄 이번 달 항목 내역. */
  const selectedCategoryItems = useMemo(
    () => selectedSpendCategory !== null
      ? calculateCategoryItems(spendHistoryPurchases, selectedSpendCategory, currentYearNum, currentMonthNum)
      : null,
    [spendHistoryPurchases, selectedSpendCategory, currentYearNum, currentMonthNum],
  );

  /**
   * "AI 절약 제안"/절약 후보 — 사용자가 "유지 안 함"으로 명시했거나(discontinuedAt), 연속
   * MISSED_ROUNDS_REVIEW_THRESHOLD(3)회차 이상 "유지하기"를 안 누른 정기배송/구독. 실제 사용
   * 여부를 직접 아는 건 아니라 참고용 추천이다 — isExplicit=false(미확인 추정)면 화면에서
   * "사용 안 함"이라 단정하지 말고 "최근 이용 상태가 확인되지 않았습니다"로 표현해야 한다.
   */
  const {
    reviewCandidates,
    savingsEstimate,
    needsConfirmationItems,
    pendingPriceChangeByPurchaseId,
    priceChangeCount,
    priceUpItems,
    unusedItems,
    normalItems,
  } = useMemo(() => selectPurchaseSignals(purchases, pendingItems), [purchases, pendingItems]);
  const { aiBrief, setAiBrief, aiBriefTextLoading, handleAiSummary } = useAiBrief({
    purchases,
    spendHistoryPurchases,
    reviewCount: reviewCandidates.length,
    priceUpItems,
    unusedItems,
    pendingPriceChangeByPurchaseId,
    savingsEstimate,
    fxCardSettings,
  });

  /** "확인 필요" 패널의 대상 — 결제 7일 전부터 선택하지 않은 항목과 이미 지난 미응답 항목. */
  /**
   * "가격 인상" 타일 상세용 구독/정기배송 3분류. 우선순위는 가격 변동 감지(이메일 매칭 또는
   * "유지하기" 회차 갱신) > 절약 제안(미사용 의심) > 정상 — 둘 다 해당돼도 하나의 상태로만 표시한다.
   * "사용 안 함"은 reviewCandidates(AI 절약 제안)와 완전히 같은 기준을 재사용한 것일 뿐,
   * 실사용 데이터를 보는 게 아니라서 참고용이다 — 더 정교한 사용빈도 감지 로직은 아직 없음.
   */
  /** 등록된 항목 카드의 금액 옆 인상/인하 화살표용 — 매칭된 확인 대기(이메일) 항목에서 방향을 가져온다.
   *  이메일 매칭이 없는 항목은 renderAmountChangeArrow가 p.priceChangePreviousAmount로 직접 판단한다. */
  /** "내 목록"(전체)은 지난 항목을 제외한다 — 지난 항목은 별도 탭(OVERDUE)에 모아둔다. */
  const {
    overdueItems,
    activeItems: nonOverduePurchases,
    categoryFilterOptions,
    displayedPurchases,
    totalPages: purchasesTotalPages,
    safePage: safePurchasesPage,
    pagedPurchases,
  } = useMemo(
    () => selectPurchaseList(purchases, filterType, filterCategory, purchasesPage),
    [purchases, filterType, filterCategory, purchasesPage],
  );
  const {
    handleDelete,
    handleDiscard,
    handleDiscardAll,
    handleUndiscard,
    handleMarkDelivered,
    handleRecurringSelectionConfirm,
    handleDiscontinue,
    handleResume,
    handleDisableDeadlineNotifications,
    handleConfirmAll,
    handleArchive,
    handleUnarchive,
  } = usePurchaseMutations({
    overdueItems,
    needsConfirmationItems,
    load,
    loadSpendHistory,
    loadArchived,
    setConfirmedRecurringIds,
    setConfirmAllMessage,
  });

  /** 실제로 존재하는 카테고리만 드롭다운 옵션으로 노출한다(빈 옵션 방지) — 종류를 "전체"로 두면
   *  전체 항목 기준, 특정 종류를 골랐으면 그 종류 안에서만 존재하는 카테고리로 좁힌다. */
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
      <DashboardConfirmationModals
        confirmRecurringIds={confirmRecurringIds} recurringSelectionItems={recurringSelectionItems}
        recurringBatchMaintainedIds={recurringBatchMaintainedIds} setRecurringBatchMaintainedIds={setRecurringBatchMaintainedIds}
        confirmRecurringBatchToken={confirmRecurringBatchToken} confirmArrivalBatchToken={confirmArrivalBatchToken}
        arrivalConfirmSubmitting={arrivalConfirmSubmitting} arrivalConfirmError={arrivalConfirmError}
        arrivalBatchItems={arrivalBatchItems} arrivalBatchReceived={arrivalBatchReceived} setArrivalBatchReceived={setArrivalBatchReceived}
        confirmArrivalToken={confirmArrivalToken} arrivalConfirmDone={arrivalConfirmDone}
        onRecurringBatchConfirm={handleRecurringBatchConfirm} onCloseRecurring={closeRecurringConfirmModal}
        onArrivalBatchConfirm={handleArrivalBatchConfirm} onCloseArrival={closeArrivalConfirmModal} onArrivalConfirm={handleArrivalConfirm}
      />
      <div className="dashboard-header">
        <h1>
          {nickname}님의 <span className="accent">챙길 목록</span>
        </h1>
      </div>

      <PushPermissionBanner />

      {purchasesLoaded && purchases.length > 0 && (
        <DashboardSummaryBoard
          currentMonthNum={currentMonthNum} monthlySpendEstimate={monthlySpendEstimate} yearlySpendEstimate={yearlySpendEstimate}
          weeklyPaymentCount={weeklyPaymentCount} recurringDeliveryCount={recurringDeliveryCount} subscriptionCount={subscriptionCount}
          priceChangeCount={priceChangeCount} savingsEstimate={savingsEstimate}
          calculatorSelectedCount={calculatorSelectedItems.length} calculatorAmount={calculatorAmount}
          showSpendingDetail={showSpendingDetail} showYearlyDetail={showYearlyDetail}
          showRecurringDeliveryDetail={showRecurringDeliveryDetail} showSubscriptionDetail={showSubscriptionDetail}
          showPriceStatusDetail={showPriceStatusDetail} showSavingsDetail={showSavingsDetail}
          showSpecificSpendCalculator={showSpecificSpendCalculator}
          toggleSpending={() => setShowSpendingDetail((value) => !value)} toggleYearly={() => setShowYearlyDetail((value) => !value)}
          toggleDelivery={() => setShowRecurringDeliveryDetail((value) => !value)} toggleSubscription={() => setShowSubscriptionDetail((value) => !value)}
          togglePrice={() => setShowPriceStatusDetail((value) => !value)} toggleSavings={() => setShowSavingsDetail((value) => !value)}
          toggleCalculator={() => setShowSpecificSpendCalculator((value) => !value)}
        />
      )}

      {showSpendingDetail && (
        <div className="spending-detail">
          <div className="spending-detail__section">
            <p className="spending-detail__heading">📋 {currentMonthNum}월 예상지출 내역</p>
            {renderMonthSpendingBody(currentMonthNum, spendingByDate, monthlySpendEstimate)}
          </div>

          {categoryCounts.length > 0 && (
            <div className="spending-detail__section">
              <p className="spending-detail__heading">🗂 카테고리별 분석</p>
              <ul className="spending-detail__category-list">
                {categoryCounts.map(({ category: cat, count, amount }) => (
                  <li key={cat}>
                    <button
                      type="button"
                      className="spending-detail__category-item"
                      onClick={() => setSelectedSpendCategory(cat)}
                    >
                      <span>
                        {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat]}
                      </span>
                      <span className="spending-detail__category-stats">
                        <span className="mono">{count}개</span>
                        <span className="mono">{amount.toLocaleString('ko-KR')}원</span>
                      </span>
                    </button>
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
                <li key={month}>
                  <button
                    type="button"
                    className={`spending-detail__month-item${
                      month === currentMonthNum ? ' spending-detail__month-item--current' : ''
                    }`}
                    onClick={() => setSelectedSpendMonth(month)}
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
                  </button>
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

      {selectedSpendMonth !== null && selectedMonthSpending !== null && (
        <div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="month-spend-modal-title"
          onClick={() => setSelectedSpendMonth(null)}
        >
          <div className="month-spend-modal" onClick={(e) => e.stopPropagation()}>
            <p className="spending-detail__heading" id="month-spend-modal-title">
              📋 {selectedSpendMonth}월 예상지출 내역
            </p>
            {renderMonthSpendingBody(selectedSpendMonth, selectedMonthSpending.byDate, selectedMonthSpending.total)}
            <button
              type="button"
              className="btn-text install-modal__close"
              onClick={() => setSelectedSpendMonth(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {selectedSpendCategory !== null && selectedCategoryItems !== null && (
        <div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="category-spend-modal-title"
          onClick={() => setSelectedSpendCategory(null)}
        >
          <div className="month-spend-modal" onClick={(e) => e.stopPropagation()}>
            <p className="spending-detail__heading" id="category-spend-modal-title">
              {CATEGORY_ICON[selectedSpendCategory]} {CATEGORY_LABEL[selectedSpendCategory]} — {currentMonthNum}월 지출 내역
            </p>
            {selectedCategoryItems.length === 0 ? (
              <p className="spending-detail__empty">이번 달 지출 내역이 없어요.</p>
            ) : (
              <>
                <ul className="spending-detail__list">
                  {selectedCategoryItems.map((item) => (
                    <li key={item.id}>
                      <span>
                        <span className={`spending-detail__list-type spending-detail__list-type--${item.type}`}>
                          {TYPE_SHORT_LABEL[item.type]}
                        </span>
                        {item.itemName}
                      </span>
                      <span className="mono">{item.amount.toLocaleString('ko-KR')}원</span>
                    </li>
                  ))}
                </ul>
                <p className="spending-detail__total">
                  {CATEGORY_LABEL[selectedSpendCategory]} 총 지출{' '}
                  <span className="mono">
                    {selectedCategoryItems.reduce((sum, item) => sum + item.amount, 0).toLocaleString('ko-KR')}원
                  </span>
                </p>
              </>
            )}
            <button
              type="button"
              className="btn-text install-modal__close"
              onClick={() => setSelectedSpendCategory(null)}
            >
              닫기
            </button>
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
                          <span className={`spending-detail__list-type spending-detail__list-type--${p.type}`}>
                            {formatKoreanMonthDay(p.deadline)} · {p.deliveryRound}회차
                          </span>
                          {p.itemName}
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
                          <span className={`spending-detail__list-type spending-detail__list-type--${p.type}`}>
                            {p.discontinuedAt !== null
                              ? `${p.deliveryRound}회차 (유지 안 함)`
                              : p.isOneTime
                                ? `${formatKoreanMonthDay(p.deadline)} · 1회성`
                                : `${formatKoreanMonthDay(p.deadline)} · ${p.deliveryRound}회차`}
                          </span>
                          {p.itemName}
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
                🟡 가격 변동 <span className="mono">{priceUpItems.length}</span>건
              </p>
              <ul className="spending-detail__save-list">
                {priceUpItems.map((p) => (
                  <li key={p.id}>
                    <div className="spending-detail__save-item-info">
                      <p className="spending-detail__save-item-name">
                        <span className={`spending-detail__list-type spending-detail__list-type--${p.type}`}>{TYPE_SHORT_LABEL[p.type]}</span>
                        {p.itemName}
                      </p>
                      <p className="spending-detail__save-item-reason">
                        {p.priceChangePreviousAmount !== null && p.amount !== null && p.priceChangePreviousAmount !== p.amount ? (() => {
                          const isIncrease = p.amount! > p.priceChangePreviousAmount!;
                          const dir = isIncrease ? 'up' : 'down';
                          return (
                            <>
                              <span className="mono">{p.priceChangePreviousAmount!.toLocaleString('ko-KR')}원</span>{' '}
                              <span className={`price-change-arrow price-change-arrow--${dir}`}>→</span>{' '}
                              <span className={`mono price-change-current price-change-current--${dir}`}>{p.amount!.toLocaleString('ko-KR')}원</span>{' '}
                              <span className={`price-change-label price-change-label--${dir}`}>({isIncrease ? '인상' : '인하'})</span>
                            </>
                          );
                        })() : (
                          '확인 대기 목록에서 변동 금액을 확인해보세요.'
                        )}
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
                      <p className="spending-detail__save-item-name">
                        <span className={`spending-detail__list-type spending-detail__list-type--${p.type}`}>{TYPE_SHORT_LABEL[p.type]}</span>
                        {p.itemName}
                      </p>
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
            <p className="spending-detail__hint">계산할 달을 고른 뒤, 그달에 구매·결제한 기록 중 필요한 항목만 선택하세요. 삭제한 기록은 표시되지 않습니다.</p>

            <label className="specific-spend-calculator__month">
              <span>계산할 달</span>
              <input
                type="month"
                value={calculatorMonth}
                max={`${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}`}
                onChange={(event) => {
                  setCalculatorMonth(event.target.value);
                  setCalculatorCategories([]);
                  setCalculatorSelectedItemIds([]);
                }}
              />
            </label>

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
                <p className="spending-detail__empty">선택한 달과 조건에 해당하는 구매 기록이 없어요.</p>
              ) : (
                calculatorCategoryFiltered.map((p) => {
                  const checked = calculatorSelectedItemIds.includes(p.id);
                  const itemAmount = calculateSelectedSpend(
                    [p],
                    [p.id],
                    calculatorYearNum,
                    calculatorMonthNum,
                  );
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
              <span>선택한 {calculatorSelectedItems.length}건의 {calculatorYearNum}년 {calculatorMonthNum}월 지출</span>
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
                        <p className="spending-detail__save-item-name">
                          <span className={`spending-detail__list-type spending-detail__list-type--${item.type}`}>{TYPE_SHORT_LABEL[item.type]}</span>
                          {item.itemName}
                        </p>
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
      <AiBriefPanel
        loaded={purchasesLoaded}
        purchaseCount={purchases.length}
        brief={aiBrief}
        loading={aiBriefTextLoading}
        onAnalyze={handleAiSummary}
        onCollapse={() => setAiBrief(null)}
      />

      {(weeklyDeliveries.length > 0 || weeklySubscriptions.length > 0) && (
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
                  <span className="confirm-needed-section__rounds">
                    {missedRoundsFor(p) > 0
                      ? `${missedRoundsFor(p)}회차 미응답 · 아직 유지 여부를 선택하지 않음`
                      : `${p.paymentDDay === 0 ? '오늘' : `${p.paymentDDay}일 후`} 예정 · 유지 여부 미선택`}
                  </span>
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

      <PendingPurchaseList
        items={pendingItems}
        onApplyPriceChange={handleApplyPriceChange}
        onRegister={handlePendingRegisterClick}
        onIgnore={handleIgnorePending}
      />

      {!showRegisterForm ? (
        <button type="button" className="register-form__toggle" onClick={() => setShowRegisterForm(true)}>
          <span className="register-form__toggle-icon" aria-hidden="true">+</span> 새 항목 등록
        </button>
      ) : (
      <PurchaseForm
        form={purchaseForm}
        onSubmit={handleSubmit}
        onCancel={handleCancelEdit}
        errorMessage={errorMessage}
      />
      )}

      <p className="register-form__hint register-form__hint--legend">
        항목을 치울 때 <strong>삭제</strong>와 <strong>취소</strong>는 달라요 — <strong>삭제</strong>는
        목록에서만 빠지고 이미 발생한 지출은 통계에 그대로 남아요(이미 받은 배송, 지난 결제 등).{' '}
        <strong>취소</strong>는 지출 기록까지 완전히 없어져요(잘못 등록했거나, 주문이 취소됐거나,
        환불받아서 지출로 칠 필요가 없는 경우에 써주세요).
      </p>

      <PurchaseListTabs
        view={view}
        overdueCount={overdueItems.length}
        hasAcceptedShares={acceptedShares.length > 0}
        exporting={exporting}
        onChange={setView}
        onSelectShared={handleSelectSharedView}
        onExport={handleExport}
      />

      {view === 'ACTIVE' && (
        <>
          <div className="filters-row">
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

            {/* 카테고리는 12개+미지정이라 유형처럼 칩으로 늘어놓으면 화면이 지저분해진다 —
                유형 옆에 드롭다운 하나로 좁혀서, 선택하면 그 카테고리만 남긴다. */}
            {categoryFilterOptions.length > 0 && (
              <div className="category-filter">
                <select
                  id="categoryFilterSelect"
                  className="category-filter__select"
                  aria-label="카테고리별 필터"
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value as 'ALL' | 'UNCATEGORIZED' | PurchaseCategory);
                    setPurchasesPage(1);
                  }}
                >
                  <option value="ALL">카테고리 전체</option>
                  {categoryFilterOptions.map((c) => {
                    const count = purchases.filter(
                      (p) =>
                        (filterType === 'ALL' || p.type === filterType) &&
                        (c === 'UNCATEGORIZED' ? p.category === null : p.category === c)
                    ).length;
                    return (
                      <option key={c} value={c}>
                        {c === 'UNCATEGORIZED' ? '미지정' : `${CATEGORY_ICON[c]} ${CATEGORY_LABEL[c]}`} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          <ActivePurchaseList
            allCount={purchases.length} activeCount={nonOverduePurchases.length} filteredCount={displayedPurchases.length}
            purchases={pagedPurchases} page={safePurchasesPage} totalPages={purchasesTotalPages}
            currentYear={currentYearNum} currentMonth={currentMonthNum}
            deadlineNotificationsEnabled={deadlineNotificationsEnabled} pendingPriceChanges={pendingPriceChangeByPurchaseId}
            needsAttention={needsAttentionBadge} onPageChange={setPurchasesPage}
            onDisableNotifications={handleDisableDeadlineNotifications} onEdit={handleEditClick}
            onArchive={handleArchive} onDiscard={handleDiscard} onDelete={handleDelete}
            onDiscontinue={handleDiscontinue}
          />
        </>
      )}

      {view === 'OVERDUE' && (
        <OverduePurchaseList
          purchases={overdueItems} pendingPriceChanges={pendingPriceChangeByPurchaseId}
          currentYear={currentYearNum} currentMonth={currentMonthNum}
          needsAttention={needsAttentionBadge} onDiscardAll={handleDiscardAll} onResume={handleResume}
          onEdit={handleEditClick} onArchive={handleArchive} onDiscard={handleDiscard} onUndiscard={handleUndiscard} onDelete={handleDelete}
        />
      )}

      {view === 'ARCHIVED' && (
        <ArchivedPurchaseList purchases={archivedPurchases} onRestore={handleUnarchive} onDiscard={handleDiscard} onDelete={handleDelete} />
      )}

      {view === 'SHARED' && (
        <SharedPurchaseList shares={acceptedShares} selectedShareId={selectedShareId} purchases={sharedPurchases} onSelectShare={setSelectedShareId} />
      )}
    </div>
  );
}

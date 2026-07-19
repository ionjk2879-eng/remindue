import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  fetchPurchases,
  createPurchase,
  updatePurchase,
  deletePurchase,
  markDelivered,
  archivePurchase,
  unarchivePurchase,
  downloadExport,
} from '../api/purchases';
import { fetchPendingPurchases, confirmPendingPurchase, ignorePendingPurchase } from '../api/pendingPurchases';
import { fetchReceivedInvites, fetchSharedPurchases } from '../api/sharing';
import type { PendingPurchase, Purchase, PurchaseType, SharedAccess } from '../types';
import { useAuth } from '../context/AuthContext';
import StampBadge from '../components/StampBadge';
import PremiumBadge from '../components/PremiumBadge';
import PushPermissionBanner from '../components/PushPermissionBanner';

const TYPE_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '전자제품 (보증기간)',
  ONLINE_ORDER: '온라인 주문 (반품기한)',
  RECURRING_DELIVERY: '정기배송',
};

const DEADLINE_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '보증만료일',
  ONLINE_ORDER: '반품기한',
  RECURRING_DELIVERY: '다음 배송일',
};

const TYPE_SHORT_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '전자제품',
  ONLINE_ORDER: '온라인주문',
  RECURRING_DELIVERY: '정기배송',
};

const PURCHASE_TYPES: PurchaseType[] = ['ELECTRONICS', 'ONLINE_ORDER', 'RECURRING_DELIVERY'];

type FilterType = 'ALL' | PurchaseType;

/** 목록 위 필터 메뉴 — 종류별 배지/점 색과 동일한 팔레트를 쓰지만 라벨은 사용자가 목록을 훑을 때 더 와닿는 실용적인 표현으로 따로 둔다. */
const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'ELECTRONICS', label: 'A/S보증' },
  { key: 'ONLINE_ORDER', label: '환불' },
  { key: 'RECURRING_DELIVERY', label: '정기배송' },
];

/** "7일 이내" 배너와 동일한 기준 — 이 안으로 들어오면 다시 챙길 때가 된 것으로 본다. */
const URGENT_WINDOW_DAYS = 7;

/** 무료 플랜(isPremium=false) 최대 등록 개수 — 백엔드 purchase-logic.ts의 FREE_PLAN_MAX_PURCHASES와 값을 맞춘다. */
const FREE_PLAN_MAX_PURCHASES = 5;

/** "2026-08-15" -> "8/15" */
function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}`;
}

/** date.ts의 backend todayDateOnly()와 동일한 기준(KST) — "이번 회차 수령 확인"을 오늘 이미 눌렀는지 비교에 쓴다. */
function todayDateOnly(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

/**
 * 정기배송이고 오늘 이미 "이번 회차 수령 확인"을 눌렀는지. (예전에는 계산상 회차 수와
 * delivery_confirm_count를 비교해서 "놓친 배송"까지 판단했지만, 실제 배송 지연 등으로 오탐이
 * 잦아 그 비교 로직 자체를 제거했다 — 지금은 "오늘 확인 버튼을 눌렀는가"만 본다.)
 */
function isFullyConfirmed(p: Purchase): boolean {
  return p.type === 'RECURRING_DELIVERY' && p.lastDeliveredDate === todayDateOnly();
}

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [type, setType] = useState<PurchaseType>('ELECTRONICS');
  const [itemName, setItemName] = useState('');
  const [baseDate, setBaseDate] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [returnDeadlineDays, setReturnDeadlineDays] = useState('7');
  const [intervalDays, setIntervalDays] = useState('30');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [forwardingEmail, setForwardingEmail] = useState('');
  const [pendingItems, setPendingItems] = useState<PendingPurchase[]>([]);
  const [pendingConfirmId, setPendingConfirmId] = useState<number | null>(null);
  const [addressCopied, setAddressCopied] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [view, setView] = useState<'ACTIVE' | 'ARCHIVED' | 'SHARED'>('ACTIVE');
  const [archivedPurchases, setArchivedPurchases] = useState<Purchase[]>([]);
  const [acceptedShares, setAcceptedShares] = useState<SharedAccess[]>([]);
  const [selectedShareId, setSelectedShareId] = useState<number | null>(null);
  const [sharedPurchases, setSharedPurchases] = useState<Purchase[]>([]);
  const [exporting, setExporting] = useState(false);
  const { nickname, isPremium, premiumSince, paymentCount } = useAuth();

  const load = async () => {
    const data = await fetchPurchases();
    setPurchases(data);
  };

  const loadPending = async () => {
    const data = await fetchPendingPurchases();
    setForwardingEmail(data.forwardingEmail);
    setPendingItems(data.items);
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
    loadPending();
    loadAcceptedShares();
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

  const resetForm = () => {
    setEditingId(null);
    setPendingConfirmId(null);
    setType('ELECTRONICS');
    setItemName('');
    setBaseDate('');
    setWarrantyMonths('12');
    setReturnDeadlineDays('7');
    setIntervalDays('30');
  };

  const handleEditClick = (p: Purchase) => {
    setErrorMessage(null);
    setEditingId(p.id);
    setType(p.type);
    setItemName(p.itemName);
    setBaseDate(p.baseDate);
    setWarrantyMonths(String(p.warrantyMonths ?? 12));
    setReturnDeadlineDays(String(p.returnDeadlineDays ?? 7));
    setIntervalDays(String(p.intervalDays ?? 30));
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
    setType(item.type);
    setItemName(item.itemName ?? '');
    setBaseDate(item.orderDate ?? item.expectedDeliveryDate ?? '');
    if (item.returnDeadlineDays !== null) {
      setReturnDeadlineDays(String(item.returnDeadlineDays));
    }
    setPendingConfirmId(item.id);
  };

  const handleIgnorePending = async (id: number) => {
    await ignorePendingPurchase(id);
    await loadPending();
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setShowPremiumUpsell(false);
    const input = {
      type,
      itemName,
      baseDate,
      warrantyMonths: type === 'ELECTRONICS' ? Number(warrantyMonths) : undefined,
      returnDeadlineDays: type === 'ONLINE_ORDER' ? Number(returnDeadlineDays) : undefined,
      intervalDays: type === 'RECURRING_DELIVERY' ? Number(intervalDays) : undefined,
    };
    const confirmingPendingId = pendingConfirmId;
    try {
      if (editingId !== null) {
        await updatePurchase(editingId, input);
      } else {
        await createPurchase(input);
        if (confirmingPendingId !== null) {
          await confirmPendingPurchase(confirmingPendingId);
        }
      }
      resetForm();
      await load();
      if (confirmingPendingId !== null) {
        await loadPending();
      }
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

  const handleDelete = async (id: number) => {
    await deletePurchase(id);
    await load();
  };

  const handleMarkDelivered = async (id: number) => {
    await markDelivered(id);
    await load();
  };

  const handleArchive = async (id: number) => {
    await archivePurchase(id);
    await load();
  };

  const handleUnarchive = async (id: number) => {
    await unarchivePurchase(id);
    await loadArchived();
    await load();
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
    .filter((p) => p.dDay >= 0 && p.dDay <= URGENT_WINDOW_DAYS)
    .sort((a, b) => a.dDay - b.dDay);
  const urgentAllHandled = urgent.length > 0 && urgent.every(isFullyConfirmed);

  /** 프리미엄 알림 기능(주간 요약) — 정기배송 중 이번 주(오늘부터 7일 이내) 배송 예정인 것만. */
  const weeklyRecurring = purchases
    .filter((p) => p.type === 'RECURRING_DELIVERY' && p.dDay >= 0 && p.dDay <= URGENT_WINDOW_DAYS)
    .sort((a, b) => a.dDay - b.dDay);

  const displayedPurchases = filterType === 'ALL' ? purchases : purchases.filter((p) => p.type === filterType);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>
          {nickname}
          {isPremium && <PremiumBadge premiumSince={premiumSince} paymentCount={paymentCount} />}님의{' '}
          <span className="accent">챙길 목록</span>
        </h1>
        {!isPremium && (
          <Link to="/pricing" className="plan-counter mono">
            {purchases.length}/{FREE_PLAN_MAX_PURCHASES}개 등록됨
          </Link>
        )}
      </div>

      {isPremium && weeklyRecurring.length > 0 && (
        <div className="weekly-summary-banner">
          <span className="weekly-summary-banner__tag">
            📦 이번 주 배송 예정 <span className="mono">{weeklyRecurring.length}</span>건
          </span>
          <ul>
            {weeklyRecurring.map((p) => (
              <li key={p.id}>
                {p.itemName} — <span className="mono">{formatShortDate(p.deadline)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PushPermissionBanner />

      {forwardingEmail && (
        <div className="forwarding-banner">
          <span className="forwarding-banner__label">📧 주문확인 메일 자동 등록 주소</span>
          <div className="forwarding-banner__row">
            <span className="mono forwarding-banner__address">{forwardingEmail}</span>
            <button type="button" className="btn-text" onClick={handleCopyForwardingEmail}>
              {addressCopied ? '복사됨' : '복사'}
            </button>
          </div>
          <p className="forwarding-banner__hint">
            쇼핑몰 주문확인 메일을 이 주소로 전달(포워딩)하면 자동으로 아래 "확인 대기" 목록에 올라와요.
          </p>
          <p className="forwarding-banner__privacy">
            🔒 전달하신 이메일은 상품명·날짜 추출을 위해 Claude API(Anthropic)로 처리되며, 처리 후
            원본은 저장되지 않습니다.
          </p>
        </div>
      )}

      {pendingItems.length > 0 && (
        <div className="pending-section">
          <p className="pending-section__title">
            📥 확인 대기 중인 항목 <span className="mono">{pendingItems.length}</span>건
          </p>
          <div className="pending-list">
            {pendingItems.map((item) => (
              <div className="pending-card" key={item.id}>
                <div className="pending-card__body">
                  <p className="pending-card__name">
                    <span className={`type-dot type-dot--${item.type}`} aria-hidden="true" />
                    {item.itemName ?? '(상품명 미확인)'}
                    <span className={`pending-card__type pending-card__type--${item.type}`}>
                      {TYPE_SHORT_LABEL[item.type]}
                    </span>
                  </p>
                  <p className="pending-card__meta">
                    {item.orderDate && (
                      <>
                        주문일 <span className="mono">{item.orderDate}</span>
                      </>
                    )}
                    {item.type === 'ONLINE_ORDER' && item.returnDeadlineDays !== null && (
                      <>
                        {item.orderDate && ' · '}
                        반품기한 <span className="mono">{item.returnDeadlineDays}일</span>
                      </>
                    )}
                    {item.expectedDeliveryDate && (
                      <>
                        {(item.orderDate || (item.type === 'ONLINE_ORDER' && item.returnDeadlineDays !== null)) && ' · '}
                        예상배송일 <span className="mono">{item.expectedDeliveryDate}</span>
                      </>
                    )}
                  </p>
                  {item.type === 'ONLINE_ORDER' && item.returnDeadlineEstimated && (
                    <p className="pending-card__hint">
                      ⚠️ 반품기한이 명시되어 있지 않아 법정 최소 기간(7일)으로 추정했어요. 실제 구매처 주문내역에서 확인해주세요.
                    </p>
                  )}
                  {item.type === 'RECURRING_DELIVERY' && (
                    <p className="pending-card__hint">
                      ⚠️ 배송 주기는 원본에 명시되지 않으면 정확하지 않을 수 있어요. 확인 후 등록해주세요.
                    </p>
                  )}
                </div>
                <div className="pending-card__actions">
                  <button type="button" className="btn btn-sm" onClick={() => handlePendingRegisterClick(item)}>
                    확인 후 등록
                  </button>
                  <button type="button" className="btn-text" onClick={() => handleIgnorePending(item.id)}>
                    무시
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                {p.itemName} — {DEADLINE_LABEL[p.type]} <span className="mono">{p.deadline}</span>
                {isFullyConfirmed(p) && <span className="confirm-badge confirm-badge--sm">✓ 확인완료</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="register-form" onSubmit={handleSubmit}>
        <p className="register-form__title">
          {editingId !== null ? '항목 수정' : pendingConfirmId !== null ? '확인 대기 항목 등록' : '새 항목 등록'}
        </p>
        <div className="register-form__row">
          <div className="field field--narrow">
            <label htmlFor="type">종류</label>
            <div className="type-select-row">
              <span className={`type-dot type-dot--${type}`} aria-hidden="true" />
              <select id="type" value={type} onChange={(e) => setType(e.target.value as PurchaseType)}>
                <option value="ELECTRONICS">전자제품</option>
                <option value="ONLINE_ORDER">온라인 주문</option>
                <option value="RECURRING_DELIVERY">정기배송</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="itemName">항목명</label>
            <input
              id="itemName"
              placeholder="예: 삼성 냉장고"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
          </div>

          <div className="field field--date">
            <label htmlFor="baseDate">
              {type === 'RECURRING_DELIVERY' ? '배송 시작일' : type === 'ONLINE_ORDER' ? '수령일' : '구매일'}
            </label>
            <input id="baseDate" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} required />
          </div>

          {type === 'ELECTRONICS' && (
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
          {type === 'ONLINE_ORDER' && (
            <div className="field field--narrow">
              <label htmlFor="returnDeadlineDays">반품기한(일)</label>
              <input
                id="returnDeadlineDays"
                type="number"
                value={returnDeadlineDays}
                onChange={(e) => setReturnDeadlineDays(e.target.value)}
              />
            </div>
          )}
          {type === 'RECURRING_DELIVERY' && (
            <div className="field field--narrow">
              <label htmlFor="intervalDays">배송주기(일)</label>
              <input
                id="intervalDays"
                type="number"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="btn">
            {editingId !== null ? '수정 완료' : '등록'}
          </button>
          {(editingId !== null || pendingConfirmId !== null) && (
            <button type="button" className="btn-text" onClick={handleCancelEdit}>
              취소
            </button>
          )}
        </div>
        {errorMessage && <p className="form-error" style={{ marginTop: 12 }}>{errorMessage}</p>}
        {showPremiumUpsell && (
          <p className="premium-upsell" style={{ marginTop: 6 }}>
            ✨ 프리미엄으로 업그레이드하면 등록 개수 제한 없이 이용할 수 있어요.{' '}
            <Link to="/pricing">업그레이드하기 →</Link>
          </p>
        )}
      </form>

      <div className="view-tabs" role="tablist" aria-label="목록 종류">
        <button type="button" className={`view-tabs__btn${view === 'ACTIVE' ? ' view-tabs__btn--active' : ''}`} onClick={() => setView('ACTIVE')}>
          내 목록
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
              const count = opt.key === 'ALL' ? purchases.length : purchases.filter((p) => p.type === opt.key).length;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={filterType === opt.key}
                  key={opt.key}
                  className={`type-filter__btn${opt.key !== 'ALL' ? ` type-filter__btn--${opt.key}` : ''}${
                    filterType === opt.key ? ' type-filter__btn--active' : ''
                  }`}
                  onClick={() => setFilterType(opt.key)}
                >
                  {opt.key !== 'ALL' && <span className={`type-dot type-dot--${opt.key}`} aria-hidden="true" />}
                  {opt.label}
                  <span className="mono type-filter__count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="ticket-list">
            {displayedPurchases.map((p) => (
              <div className="ticket-card" key={p.id}>
                <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
                <div className="ticket-card__body">
                  <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                  <h3 className="ticket-card__title">{p.itemName}</h3>
                  {p.type === 'RECURRING_DELIVERY' && p.deliveryRound !== null ? (
                    <p className="ticket-card__deadline">
                      다음 배송: <span className="mono">{p.deliveryRound}회차</span> ({formatShortDate(p.deadline)})
                    </p>
                  ) : (
                    <p className="ticket-card__deadline">
                      {DEADLINE_LABEL[p.type]} · <span className="mono">{p.deadline}</span>
                    </p>
                  )}
                  <div className="ticket-card__actions">
                    {p.type === 'RECURRING_DELIVERY' &&
                      (isFullyConfirmed(p) ? (
                        <span className="confirm-badge">✓ 확인완료</span>
                      ) : (
                        <button className="btn-text" onClick={() => handleMarkDelivered(p.id)}>
                          이번 회차 수령 확인
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
                    <button className="btn-text" onClick={() => handleDelete(p.id)}>
                      삭제
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
          {purchases.length > 0 && displayedPurchases.length === 0 && (
            <p className="empty-state">해당 종류의 항목이 없습니다.</p>
          )}
        </>
      )}

      {view === 'ARCHIVED' && (
        <>
          <div className="ticket-list">
            {archivedPurchases.map((p) => (
              <div className="ticket-card ticket-card--archived" key={p.id}>
                <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
                <div className="ticket-card__body">
                  <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                  <h3 className="ticket-card__title">{p.itemName}</h3>
                  <p className="ticket-card__deadline">
                    {DEADLINE_LABEL[p.type]} · <span className="mono">{p.deadline}</span>
                  </p>
                  <div className="ticket-card__actions">
                    <button className="btn-text" onClick={() => handleUnarchive(p.id)}>
                      복원
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
                  <span className={`ticket-card__type ticket-card__type--${p.type}`}>{TYPE_LABEL[p.type]}</span>
                  <h3 className="ticket-card__title">{p.itemName}</h3>
                  {p.type === 'RECURRING_DELIVERY' && p.deliveryRound !== null ? (
                    <p className="ticket-card__deadline">
                      다음 배송: <span className="mono">{p.deliveryRound}회차</span> ({formatShortDate(p.deadline)})
                    </p>
                  ) : (
                    <p className="ticket-card__deadline">
                      {DEADLINE_LABEL[p.type]} · <span className="mono">{p.deadline}</span>
                    </p>
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

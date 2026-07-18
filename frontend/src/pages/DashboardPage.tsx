import { useEffect, useState, type FormEvent } from 'react';
import { fetchPurchases, createPurchase, deletePurchase, markDelivered } from '../api/purchases';
import type { Purchase, PurchaseType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import StampBadge from '../components/StampBadge';

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

/** "7일 이내" 배너와 동일한 기준 — 이 안으로 들어오면 다시 챙길 때가 된 것으로 본다. */
const URGENT_WINDOW_DAYS = 7;

/** "2026-08-15" -> "8/15" */
function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number);
  return `${month}/${day}`;
}

/**
 * 정기배송이고 계산상 회차만큼 "이번 회차 수령 확인"을 다 눌러서 놓친 게 없는 상태인지.
 * (ELECTRONICS/ONLINE_ORDER는 확인 개념이 없으니 항상 false — 배너/스탬프가 "해결됨"으로
 * 표시되지 않고 dDay가 지날 때까지 계속 챙겨야 할 항목으로 남는다.)
 */
function isFullyConfirmed(p: Purchase): boolean {
  return p.type === 'RECURRING_DELIVERY' && p.missedConfirmations === 0;
}

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [type, setType] = useState<PurchaseType>('ELECTRONICS');
  const [itemName, setItemName] = useState('');
  const [baseDate, setBaseDate] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [returnDeadlineDays, setReturnDeadlineDays] = useState('7');
  const [intervalDays, setIntervalDays] = useState('30');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { nickname, logout } = useAuth();
  const navigate = useNavigate();

  const load = async () => {
    const data = await fetchPurchases();
    setPurchases(data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await createPurchase({
        type,
        itemName,
        baseDate,
        warrantyMonths: type === 'ELECTRONICS' ? Number(warrantyMonths) : undefined,
        returnDeadlineDays: type === 'ONLINE_ORDER' ? Number(returnDeadlineDays) : undefined,
        intervalDays: type === 'RECURRING_DELIVERY' ? Number(intervalDays) : undefined,
      });
      setItemName('');
      setBaseDate('');
      await load();
    } catch (err) {
      setErrorMessage('등록하지 못했습니다. 입력값을 확인해주세요.');
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const urgent = purchases.filter((p) => p.dDay >= 0 && p.dDay <= URGENT_WINDOW_DAYS);
  const urgentAllHandled = urgent.length > 0 && urgent.every(isFullyConfirmed);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>
          {nickname}님의 <span className="accent">챙길 목록</span>
        </h1>
        <button className="btn btn-outline btn-sm" onClick={handleLogout}>
          로그아웃
        </button>
      </div>

      <div className="type-legend">
        {PURCHASE_TYPES.map((t) => (
          <span className="type-legend__item" key={t}>
            <span className={`type-dot type-dot--${t}`} aria-hidden="true" />
            {TYPE_SHORT_LABEL[t]}
          </span>
        ))}
      </div>

      {urgent.length > 0 && (
        <div className={`urgent-banner${urgentAllHandled ? ' urgent-banner--ok' : ''}`}>
          <span className={`urgent-banner__tag${urgentAllHandled ? ' urgent-banner__tag--ok' : ''}`}>
            {urgentAllHandled ? '✓' : '⚠'} 7일 이내 {urgentAllHandled ? '배송 예정' : '마감'}{' '}
            <span className="mono">{urgent.length}</span>건
            {urgentAllHandled && ' — 놓친 배송 없음'}
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

      <form className="register-form" onSubmit={handleAdd}>
        <p className="register-form__title">새 항목 등록</p>
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
            등록
          </button>
        </div>
        {errorMessage && <p className="form-error" style={{ marginTop: 12 }}>{errorMessage}</p>}
      </form>

      <div className="ticket-list">
        {purchases.map((p) => (
          <div className="ticket-card" key={p.id}>
            <div className={`ticket-card__type-tab ticket-card__type-tab--${p.type}`} aria-hidden="true" />
            <div className="ticket-card__body">
              <span className="ticket-card__type">{TYPE_LABEL[p.type]}</span>
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
              {p.type === 'RECURRING_DELIVERY' && !!p.missedConfirmations && p.missedConfirmations > 0 && (
                <p className="ticket-card__hint">
                  ⚠ 확인을 놓친 배송이 있을 수 있어요 — <span className="mono">{p.missedConfirmations}</span>건 확인 누락 가능성
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
    </div>
  );
}

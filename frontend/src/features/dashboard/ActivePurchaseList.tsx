import BrandAvatar from '../../components/dashboard/BrandAvatar';
import Pagination from '../../components/Pagination';
import { PurchaseAmount } from '../../components/dashboard/PurchaseMoney';
import StampBadge from '../../components/StampBadge';
import { currentCycleDeadline, formatShortDateWithYear } from '../../components/dashboard/dashboardUtils';
import { isRecurringType, type PendingPurchase, type Purchase } from '../../types';
import {
  isFullyConfirmed, MISSED_ROUNDS_REVIEW_THRESHOLD, missedRoundsFor,
  renderAmountChangeArrow, renderCategoryBadge, renderGeneralDeadlineLines,
  renderRecurringScheduleLine, TYPE_LABEL,
} from './dashboardModel';

interface Props {
  allCount: number;
  activeCount: number;
  filteredCount: number;
  purchases: Purchase[];
  page: number;
  totalPages: number;
  currentYear: number;
  currentMonth: number;
  isPremium: boolean;
  deadlineNotificationsEnabled: boolean | null;
  pendingPriceChanges: Map<number, PendingPurchase>;
  needsAttention: (purchase: Purchase) => boolean;
  onPageChange: (page: number) => void;
  onDisableNotifications: (id: number) => void;
  onEdit: (purchase: Purchase) => void;
  onArchive: (id: number) => void;
  onDiscard: (id: number) => void;
  onDelete: (id: number) => void;
  onDiscontinue: (id: number) => void;
}

export default function ActivePurchaseList(props: Props) {
  return <>
    <div className="ticket-list">
      {props.purchases.map((purchase) => <div className={`ticket-card ticket-card--${purchase.type}`} key={purchase.id}>
        <div className={`ticket-card__type-tab ticket-card__type-tab--${purchase.type}`} aria-hidden="true" />
        <div className="ticket-card__body">
          {isRecurringType(purchase.type) && !purchase.isOneTime && missedRoundsFor(purchase) >= MISSED_ROUNDS_REVIEW_THRESHOLD && <span className="ticket-card__missed-badge">⚠️ {missedRoundsFor(purchase)}회차 미확인</span>}
          <div className="ticket-card__heading">
            {purchase.brand && <BrandAvatar brand={purchase.brand} />}
            <div className="ticket-card__heading-text">{purchase.brand && <span className="brand-kicker">{purchase.brand}</span>}<h3 className="ticket-card__title">{purchase.itemName}</h3></div>
          </div>
          <div className="ticket-card__info-grid">
            <div><div className="ticket-card__info-label">{isRecurringType(purchase.type) ? '결제일' : '구매일'}</div><div className="ticket-card__info-value mono">{isRecurringType(purchase.type) ? formatShortDateWithYear(currentCycleDeadline(purchase, props.currentYear, props.currentMonth)) : formatShortDateWithYear(purchase.baseDate)}</div></div>
            <div><div className="ticket-card__info-label">금액</div><div className="ticket-card__info-value mono">{purchase.amount !== null ? <PurchaseAmount amount={purchase.amount} originalAmount={purchase.originalAmount} originalCurrency={purchase.originalCurrency} /> : '—'}{renderAmountChangeArrow(purchase, props.pendingPriceChanges)}</div></div>
            <div><div className="ticket-card__info-label">유형</div><span className={`ticket-card__type ticket-card__type--${purchase.type}`}>{TYPE_LABEL[purchase.type]}</span></div>
            <div><div className="ticket-card__info-label">카테고리</div>{renderCategoryBadge(purchase)}</div>
          </div>
          {isRecurringType(purchase.type) && purchase.deliveryRound !== null ? renderRecurringScheduleLine(purchase) : renderGeneralDeadlineLines(purchase)}
          <div className="ticket-card__actions">
            {props.deadlineNotificationsEnabled === true && purchase.type === 'GENERAL' && purchase.deadlineNotificationsDisabledAt === null && <button className="btn-text" onClick={() => props.onDisableNotifications(purchase.id)}>기한 알림 끄기</button>}
            {isRecurringType(purchase.type) && !purchase.isOneTime && purchase.paymentDDay <= 0 && isFullyConfirmed(purchase) && <span className="confirm-badge">✓ 확인완료</span>}
            {isRecurringType(purchase.type) && purchase.isOneTime && purchase.discontinuedAt === null && <button className="btn-text" onClick={() => props.onDiscontinue(purchase.id)}>유지 안 함</button>}
            <button className="btn-text" onClick={() => props.onEdit(purchase)}>수정</button>
            {props.isPremium && <button className="btn-text" onClick={() => props.onArchive(purchase.id)}>보관</button>}
            <button className="btn-text" onClick={() => props.onDiscard(purchase.id)}>삭제</button>
            <button className="btn-text" onClick={() => props.onDelete(purchase.id)}>취소</button>
          </div>
        </div>
        <div className="ticket-card__perforation" aria-hidden="true" />
        <div className="ticket-card__stub"><StampBadge dDay={purchase.dDay} seed={purchase.id} needsAttention={props.needsAttention(purchase)} /></div>
      </div>)}
    </div>
    {props.allCount === 0 && <p className="empty-state">등록된 항목이 없습니다.</p>}
    {props.allCount > 0 && props.activeCount === 0 && <p className="empty-state">전부 지난 항목으로 옮겨갔어요 — "지난 항목" 탭에서 확인하세요.</p>}
    {props.activeCount > 0 && props.filteredCount === 0 && <p className="empty-state">해당 종류의 항목이 없습니다.</p>}
    <Pagination page={props.page} totalPages={props.totalPages} onPageChange={props.onPageChange} />
  </>;
}

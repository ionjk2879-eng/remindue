import BrandAvatar from '../../components/dashboard/BrandAvatar';
import { PurchaseAmount } from '../../components/dashboard/PurchaseMoney';
import StampBadge from '../../components/StampBadge';
import { currentCycleDeadline, formatShortDateWithYear } from '../../components/dashboard/dashboardUtils';
import { isRecurringType, type PendingPurchase, type Purchase } from '../../types';
import {
  renderAmountChangeArrow, renderCategoryBadge, renderGeneralDeadlineLines,
  renderRecurringScheduleLine, TYPE_LABEL,
} from './dashboardModel';

interface Props {
  purchases: Purchase[];
  pendingPriceChanges: Map<number, PendingPurchase>;
  currentYear: number;
  currentMonth: number;
  isPremium: boolean;
  needsAttention: (purchase: Purchase) => boolean;
  onDiscardAll: () => void;
  onResume: (id: number) => void;
  onEdit: (purchase: Purchase) => void;
  onArchive: (id: number) => void;
  onDiscard: (id: number) => void;
  onUndiscard: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function OverduePurchaseList(props: Props) {
  const { purchases } = props;
  const naturallyOverdue = purchases.filter((p) => p.discardedAt === null);
  return <>
    <p className="register-form__hint" style={{ marginBottom: 14 }}>
      반품기한·A/S보증이 다 지난 항목, "유지 안 함"으로 표시한 정기배송·구독, 내 목록에서 직접 삭제한 항목이 여기 모여요. 삭제해도 이미 발생한 지출은 통계에 남아요.
    </p>
    {naturallyOverdue.length > 0 && <button type="button" className="btn btn-sm btn-outline" style={{ marginBottom: 14 }} onClick={props.onDiscardAll}>전체 삭제 ({naturallyOverdue.length}건)</button>}
    <div className="ticket-list">
      {purchases.map((purchase) => <div className={`ticket-card ticket-card--${purchase.type}`} key={purchase.id}>
        <div className={`ticket-card__type-tab ticket-card__type-tab--${purchase.type}`} aria-hidden="true" />
        <div className="ticket-card__body">
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
            {purchase.discardedAt !== null
              ? <>
                  <button className="btn-text" onClick={() => props.onUndiscard(purchase.id)}>복원</button>
                  <button className="btn-text" onClick={() => props.onDelete(purchase.id)}>취소</button>
                </>
              : <>
                  {isRecurringType(purchase.type) && purchase.discontinuedAt !== null && <button className="btn-text" onClick={() => props.onResume(purchase.id)}>유지하기(재개)</button>}
                  <button className="btn-text" onClick={() => props.onEdit(purchase)}>수정</button>
                  {props.isPremium && <button className="btn-text" onClick={() => props.onArchive(purchase.id)}>보관</button>}
                  <button className="btn-text" onClick={() => props.onDiscard(purchase.id)}>삭제</button>
                  <button className="btn-text" onClick={() => props.onDelete(purchase.id)}>취소</button>
                </>
            }
          </div>
        </div>
        <div className="ticket-card__perforation" aria-hidden="true" />
        <div className="ticket-card__stub"><StampBadge dDay={purchase.dDay} seed={purchase.id} needsAttention={props.needsAttention(purchase)} /></div>
      </div>)}
    </div>
    {purchases.length === 0 && <p className="empty-state">지난 항목이 없습니다.</p>}
  </>;
}

import StampBadge from '../../components/StampBadge';
import { isRecurringType, type Purchase, type SharedAccess } from '../../types';
import { renderCategoryBadge, renderGeneralDeadlineLines, renderRecurringScheduleLine, TYPE_LABEL } from './dashboardModel';

interface Props {
  shares: SharedAccess[];
  selectedShareId: number | null;
  purchases: Purchase[];
  onSelectShare: (id: number) => void;
}

export default function SharedPurchaseList({ shares, selectedShareId, purchases, onSelectShare }: Props) {
  return <>
    {shares.length > 1 && <div className="type-filter" role="tablist" aria-label="공유한 사람 선택">
      {shares.map((share) => <button type="button" key={share.id} className={`type-filter__btn${selectedShareId === share.id ? ' type-filter__btn--active' : ''}`} onClick={() => onSelectShare(share.id)}>{share.counterpart}</button>)}
    </div>}
    <div className="ticket-list">
      {purchases.map((purchase) => <div className="ticket-card" key={purchase.id}>
        <div className={`ticket-card__type-tab ticket-card__type-tab--${purchase.type}`} aria-hidden="true" />
        <div className="ticket-card__body">
          <div className="ticket-card__type-row">
            <span className={`ticket-card__type ticket-card__type--${purchase.type}`}>{TYPE_LABEL[purchase.type]}</span>
            {renderCategoryBadge(purchase)}
          </div>
          <h3 className="ticket-card__title">{purchase.itemName}</h3>
          {isRecurringType(purchase.type) && purchase.deliveryRound !== null ? renderRecurringScheduleLine(purchase) : renderGeneralDeadlineLines(purchase)}
        </div>
        <div className="ticket-card__perforation" aria-hidden="true" />
        <div className="ticket-card__stub"><StampBadge dDay={purchase.dDay} seed={purchase.id} /></div>
      </div>)}
    </div>
    {purchases.length === 0 && <p className="empty-state">공유받은 항목이 없습니다.</p>}
  </>;
}

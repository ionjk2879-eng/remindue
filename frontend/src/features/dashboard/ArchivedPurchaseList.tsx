import { isRecurringType, type Purchase } from '../../types';
import { DEADLINE_LABEL, renderCategoryBadge, renderGeneralDeadlineLines, TYPE_LABEL } from './dashboardModel';

interface Props {
  purchases: Purchase[];
  onRestore: (id: number) => void;
  onDiscard: (id: number) => void;
  onDelete: (id: number) => void;
}

export default function ArchivedPurchaseList({ purchases, onRestore, onDiscard, onDelete }: Props) {
  return <>
    <div className="ticket-list">
      {purchases.map((purchase) => <div className="ticket-card ticket-card--archived" key={purchase.id}>
        <div className={`ticket-card__type-tab ticket-card__type-tab--${purchase.type}`} aria-hidden="true" />
        <div className="ticket-card__body">
          <div className="ticket-card__type-row">
            <span className={`ticket-card__type ticket-card__type--${purchase.type}`}>{TYPE_LABEL[purchase.type]}</span>
            {renderCategoryBadge(purchase)}
          </div>
          <h3 className="ticket-card__title">{purchase.itemName}</h3>
          {isRecurringType(purchase.type)
            ? <p className="ticket-card__deadline">{DEADLINE_LABEL[purchase.type]} · <span className="mono">{purchase.deadline}</span></p>
            : renderGeneralDeadlineLines(purchase)}
          <div className="ticket-card__actions">
            <button className="btn-text" onClick={() => onRestore(purchase.id)}>복원</button>
            <button className="btn-text" onClick={() => onDiscard(purchase.id)}>삭제</button>
            <button className="btn-text" onClick={() => onDelete(purchase.id)}>취소</button>
          </div>
        </div>
      </div>)}
    </div>
    {purchases.length === 0 && <p className="empty-state">보관된 항목이 없습니다.</p>}
  </>;
}

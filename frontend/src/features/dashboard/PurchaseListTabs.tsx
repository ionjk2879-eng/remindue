export type PurchaseListView = 'ACTIVE' | 'OVERDUE' | 'ARCHIVED' | 'SHARED';

interface Props {
  view: PurchaseListView;
  overdueCount: number;
  hasAcceptedShares: boolean;
  exporting: boolean;
  onChange: (view: PurchaseListView) => void;
  onSelectShared: () => void;
  onExport: (format: 'csv' | 'pdf') => void;
}

export default function PurchaseListTabs({
  view, overdueCount, hasAcceptedShares, exporting,
  onChange, onSelectShared, onExport,
}: Props) {
  return (
    <div className="view-tabs" role="tablist" aria-label="목록 종류">
      <button type="button" className={`view-tabs__btn${view === 'ACTIVE' ? ' view-tabs__btn--active' : ''}`} onClick={() => onChange('ACTIVE')}>내 목록</button>
      <button type="button" className={`view-tabs__btn${view === 'OVERDUE' ? ' view-tabs__btn--active' : ''}`} onClick={() => onChange('OVERDUE')}>
        지난 항목{overdueCount > 0 && <span className="mono"> {overdueCount}</span>}
      </button>
      <button type="button" className={`view-tabs__btn${view === 'ARCHIVED' ? ' view-tabs__btn--active' : ''}`} onClick={() => onChange('ARCHIVED')}>보관함</button>
      {hasAcceptedShares && <button type="button" className={`view-tabs__btn${view === 'SHARED' ? ' view-tabs__btn--active' : ''}`} onClick={onSelectShared}>공유받은 목록</button>}
      {view === 'ACTIVE' && (
        <div className="view-tabs__export">
          <button type="button" className="btn-text" disabled={exporting} onClick={() => onExport('csv')}>CSV 내보내기</button>
          <button type="button" className="btn-text" disabled={exporting} onClick={() => onExport('pdf')}>PDF 내보내기</button>
        </div>
      )}
    </div>
  );
}

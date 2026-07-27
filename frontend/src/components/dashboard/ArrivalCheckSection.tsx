import type { Dispatch, SetStateAction } from 'react';
import type { Purchase } from '../../types';

interface ArrivalCheckSectionProps {
  purchases: Purchase[];
  snoozedCount: number;
  submittingId: number | null;
  daysAgoById: Record<number, number>;
  setDaysAgoById: Dispatch<SetStateAction<Record<number, number>>>;
  onConfirm: (id: number, daysAgo: number) => void;
  onSnooze: (id: number) => void;
}

export default function ArrivalCheckSection({
  purchases,
  snoozedCount,
  submittingId,
  daysAgoById,
  setDaysAgoById,
  onConfirm,
  onSnooze,
}: ArrivalCheckSectionProps) {
  if (purchases.length === 0) return null;
  return (
    <section className="arrival-check-section" aria-labelledby="arrival-check-title">
      <div className="arrival-check-section__header">
        <span id="arrival-check-title" className="arrival-check-section__title">📦 오늘 배송 받으셨나요?</span>
        <span className="arrival-check-section__hint">
          {snoozedCount > 0 ? `${snoozedCount}건은 내일 다시 알려드려요 · ` : ''}알림을 놓쳤다면 여기서 확인할 수 있어요.
        </span>
      </div>
      <ul className="arrival-check-section__list">
        {purchases.map((purchase) => {
          const isSubmitting = submittingId === purchase.id;
          const daysAgo = daysAgoById[purchase.id] ?? 0;
          const scheduledDate = purchase.type === 'GENERAL' ? purchase.expectedDeliveryDate : purchase.deadline;
          return (
            <li key={purchase.id}>
              <div>
                <strong>{purchase.itemName} · {purchase.type === 'RECURRING_DELIVERY' ? '정기배송' : '일반배송'}</strong>
                <span>예상 도착일 · <span className="mono">{scheduledDate}</span></span>
              </div>
              <div className="arrival-check-section__actions">
                <select
                  className="arrival-check-section__date-select"
                  aria-label={`${purchase.itemName} 실제 수령일`}
                  value={daysAgo}
                  disabled={isSubmitting}
                  onChange={(event) => setDaysAgoById((days) => ({ ...days, [purchase.id]: Number(event.target.value) }))}
                >
                  {Array.from({ length: 31 }, (_, optionDaysAgo) => (
                    <option key={optionDaysAgo} value={optionDaysAgo}>{optionDaysAgo === 0 ? '오늘 수령' : `${optionDaysAgo}일 전 수령`}</option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" disabled={isSubmitting} onClick={() => onConfirm(purchase.id, daysAgo)}>수령 처리</button>
                <button type="button" className="btn-text" disabled={isSubmitting} onClick={() => onSnooze(purchase.id)}>아직 미도착</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

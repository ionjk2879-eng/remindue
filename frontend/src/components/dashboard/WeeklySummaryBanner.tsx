import type { Purchase } from '../../types';
import { formatShortDate } from './dashboardUtils';

export default function WeeklySummaryBanner({ deliveries, subscriptions }: {
  deliveries: Purchase[];
  subscriptions: Purchase[];
}) {
  if (deliveries.length === 0 && subscriptions.length === 0) return null;
  return (
    <div className="weekly-summary-banner">
      {deliveries.length > 0 && (
        <section className="weekly-summary-banner__section" aria-labelledby="weekly-delivery-title">
          <span id="weekly-delivery-title" className="weekly-summary-banner__tag">
            📦 이번 주 도착 예정 <span><span className="mono">{deliveries.length}</span>건</span>
          </span>
          <ul>
            {deliveries.map((purchase) => (
              <li key={purchase.id}>
                {purchase.itemName} — <span className="mono">{formatShortDate(purchase.type === 'GENERAL' ? purchase.expectedDeliveryDate! : purchase.deadline)}</span>
                {purchase.isOneTime && <span className="weekly-summary-banner__complete">유지 안 함</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {deliveries.length > 0 && subscriptions.length > 0 && <div className="weekly-summary-banner__perforation" aria-hidden="true" />}
      {subscriptions.length > 0 && (
        <section className="weekly-summary-banner__section" aria-labelledby="weekly-subscription-title">
          <span id="weekly-subscription-title" className="weekly-summary-banner__tag weekly-summary-banner__tag--subscription">
            💳 이번 주 결제 예정 <span><span className="mono">{subscriptions.length}</span>건</span>
          </span>
          <ul>
            {subscriptions.map((purchase) => (
              <li key={purchase.id}>
                {purchase.itemName} — <span className="mono">{formatShortDate(purchase.deadline)}</span>
                {purchase.isOneTime && <span className="weekly-summary-banner__complete">유지 안 함</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

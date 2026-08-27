import { useEffect, useState } from 'react';
import type { Purchase } from '../../types';
import { formatKoreanDateWithWeekday, formatShortDate, todayDateOnly } from './dashboardUtils';

/** 자정을 넘겨 페이지를 계속 열어둬도 날짜가 저절로 갱신되도록 1분마다 다시 확인한다 — 날짜
 *  자체는 하루에 한 번만 바뀌니 그보다 촘촘한 주기는 불필요하다. */
function useTodayDate(): string {
  const [today, setToday] = useState(todayDateOnly);
  useEffect(() => {
    const id = window.setInterval(() => setToday(todayDateOnly()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

export default function WeeklySummaryBanner({ deliveries, subscriptions }: {
  deliveries: Purchase[];
  subscriptions: Purchase[];
}) {
  const today = useTodayDate();
  if (deliveries.length === 0 && subscriptions.length === 0) return null;
  return (
    <div className="weekly-summary-banner">
      <p className="weekly-summary-banner__today">📅 오늘은 {formatKoreanDateWithWeekday(today)}이에요</p>
      {deliveries.length > 0 && (
        <section className="weekly-summary-banner__section" aria-labelledby="weekly-delivery-title">
          <span id="weekly-delivery-title" className="weekly-summary-banner__tag">
            📦 이번 주 도착 예정 <span><span className="mono">{deliveries.length}</span>건</span>
          </span>
          <ul>
            {deliveries.map((purchase) => {
              // RECURRING_DELIVERY는 실제 도착일을 모르므로(참고용 범위만 있음) 정확한 날짜 대신
              // arrivalRangeEstimate 범위를 보여주고, "수령함" 배지도 붙이지 않는다 — 실제 수령
              // 여부를 확인하는 절차 자체가 GENERAL 전용(arrival-confirm.ts)이기 때문이다.
              if (purchase.type === 'RECURRING_DELIVERY') {
                const range = purchase.arrivalRangeEstimate!;
                return (
                  <li key={purchase.id}>
                    {purchase.itemName} —{' '}
                    <span className="mono">{formatShortDate(range.from)}~{formatShortDate(range.to)}</span>
                    <span className="weekly-summary-banner__estimate">추정</span>
                  </li>
                );
              }
              const arrivalDate = purchase.expectedDeliveryDate!;
              return (
                <li key={purchase.id}>
                  {purchase.itemName} — <span className="mono">{formatShortDate(arrivalDate)}</span>
                  {purchase.lastDeliveredDate === arrivalDate && (
                    <span className="weekly-summary-banner__complete">수령함</span>
                  )}
                </li>
              );
            })}
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
                {purchase.renewalDecisionFor === purchase.deadline && (
                  <span className="weekly-summary-banner__complete">유지함</span>
                )}
                {purchase.isOneTime && <span className="weekly-summary-banner__complete">유지 안 함</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

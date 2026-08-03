import type { PendingPurchase } from '../../types';
import { isRecurringType } from '../../types';
import BrandAvatar from '../../components/dashboard/BrandAvatar';
import { FxHint } from '../../components/dashboard/PurchaseMoney';
import { formatIntervalDaysLabel } from '../../components/dashboard/dashboardUtils';
import { CATEGORY_ICON, CATEGORY_LABEL, TYPE_SHORT_LABEL } from './dashboardModel';

interface PendingPurchaseListProps {
  items: PendingPurchase[];
  onApplyPriceChange: (id: number) => void;
  onRegister: (item: PendingPurchase) => void;
  onIgnore: (id: number) => void;
}
export default function PendingPurchaseList({
  items: pendingItems,
  onApplyPriceChange: handleApplyPriceChange,
  onRegister: handlePendingRegisterClick,
  onIgnore: handleIgnorePending,
}: PendingPurchaseListProps) {
  return (
    <>
    {pendingItems.length > 0 && (
      <div className="pending-section">
        <p className="pending-section__title">
          📥 확인 대기 중인 항목 <span className="mono">{pendingItems.length}</span>건
        </p>
        <div className="pending-list">
          {pendingItems.map((item) => {
            const isPriceChange = item.matchedPurchaseId !== null && item.previousAmount !== null && item.amount !== null;
            return (
            <div className={`pending-card${isPriceChange ? ' pending-card--price-change' : ''}`} key={item.id}>
              <div className="pending-card__body">
                <div className="pending-card__heading">
                  {item.brand && <BrandAvatar brand={item.brand} />}
                  <div className="pending-card__heading-text">
                    {item.brand && <span className="brand-kicker">{item.brand}</span>}
                    <p className="pending-card__name">
                      <span className={`type-dot type-dot--${item.type}`} aria-hidden="true" />
                      {item.itemName ?? '(상품명 미확인)'}
                      <span className={`pending-card__type pending-card__type--${item.type}`}>
                        {TYPE_SHORT_LABEL[item.type]}
                      </span>
                    </p>
                  </div>
                </div>
                {isPriceChange && (() => {
                  const delta = item.amount! - item.previousAmount!;
                  const isIncrease = delta > 0;
                  const dir = isIncrease ? 'up' : 'down';
                  return (
                  <p className={`pending-card__price-change price-change-label--${dir}`}>
                    {isIncrease ? '⚠ 가격 인상 감지' : '⬇ 가격 인하 감지'} — <span className="mono">{item.previousAmount!.toLocaleString('ko-KR')}원</span>{' '}
                    <span className={`price-change-arrow price-change-arrow--${dir}`}>→</span>{' '}
                    <span className={`mono price-change-current price-change-current--${dir}`}>{item.amount!.toLocaleString('ko-KR')}원</span>{' '}
                    <span className={`pending-card__price-change-delta price-change-label--${dir}`}>
                      ({isIncrease ? '+' : ''}{delta.toLocaleString('ko-KR')}원)
                    </span>
                    <FxHint
                      originalAmount={item.originalAmount}
                      originalCurrency={item.originalCurrency}
                      exchangeRate={item.exchangeRate}
                    />
                    {item.originalCurrency && (
                      <span className="pending-card__price-change-hint">
                        {' '}
                        — 실제 정가가 아니라 환율 변동 때문일 수도 있어요.
                      </span>
                    )}
                  </p>
                  );
                })()}
                <p className="pending-card__meta">
                  {isRecurringType(item.type) ? (
                    <>
                      {item.scheduleType === 'FIXED_DAY' && item.fixedDayOfMonth !== null ? (
                        <>매월 <span className="mono">{item.fixedDayOfMonth}일</span> 고정</>
                      ) : item.intervalDays !== null ? (
                        <>배송주기 <span className="mono">{formatIntervalDaysLabel(item.intervalDays)}마다</span></>
                      ) : null}
                      {item.expectedDeliveryDate && (
                        <>
                          {(item.scheduleType === 'FIXED_DAY' ? item.fixedDayOfMonth !== null : item.intervalDays !== null) && ' · '}
                          다음배송 <span className="mono">{item.expectedDeliveryDate}</span>
                        </>
                      )}
                      {item.orderDate && (
                        <>
                          {(item.scheduleType === 'FIXED_DAY' ? item.fixedDayOfMonth !== null : item.intervalDays !== null || item.expectedDeliveryDate) && ' · '}
                          신청일 <span className="mono">{item.orderDate}</span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {item.orderDate && (
                        <>주문일 <span className="mono">{item.orderDate}</span></>
                      )}
                      {item.returnDeadlineDays !== null && (
                        <>
                          {item.orderDate && ' · '}
                          반품기한 <span className="mono">{item.returnDeadlineDays}일</span>
                        </>
                      )}
                      {item.warrantyMonths !== null && (
                        <>
                          {(item.orderDate || item.returnDeadlineDays !== null) && ' · '}
                          A/S보증 <span className="mono">{item.warrantyMonths}개월</span>
                        </>
                      )}
                      {item.expectedDeliveryDate && (
                        <>
                          {(item.orderDate || item.returnDeadlineDays !== null || item.warrantyMonths !== null) && ' · '}
                          예상배송일 <span className="mono">{item.expectedDeliveryDate}</span>
                        </>
                      )}
                    </>
                  )}
                </p>
                {((!isPriceChange && item.amount !== null) || item.category) && (
                  <p className="pending-card__meta">
                    {!isPriceChange && item.amount !== null && (
                      <>
                        금액 <span className="mono">{item.amount.toLocaleString('ko-KR')}원</span>
                        <FxHint
                          originalAmount={item.originalAmount}
                          originalCurrency={item.originalCurrency}
                          exchangeRate={item.exchangeRate}
                        />
                        {item.category && ' · '}
                      </>
                    )}
                    {item.category && `${CATEGORY_ICON[item.category]} ${CATEGORY_LABEL[item.category]}`}
                  </p>
                )}
                {item.type === 'GENERAL' && (
                  <p className="pending-card__hint">
                    환불 및 A/S 정보는 정확히 인식되지 않을 수 있어요. 스토어 페이지에서 직접 확인해 주세요.
                  </p>
                )}
                {isRecurringType(item.type) && item.scheduleEstimated && (
                  <p className="pending-card__hint">
                    주기가 명확히 적혀있지 않아 1달마다로 추정했어요 — 정확한 주기를 확인해주세요.
                  </p>
                )}
              </div>
              <div className="pending-card__actions">
                {isPriceChange ? (
                  <button type="button" className="btn btn-sm" onClick={() => handleApplyPriceChange(item.id)}>
                    가격 반영
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => handlePendingRegisterClick(item)}>
                    확인 후 바로 등록
                  </button>
                )}
                <button type="button" className="btn-text" onClick={() => handleIgnorePending(item.id)}>
                  무시
                </button>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    )}
    </>
  );
}

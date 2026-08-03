import { Link } from 'react-router-dom';
import type { Dispatch, SetStateAction } from 'react';
interface Props {
 currentMonthNum:number; monthlySpendEstimate:number; yearlySpendEstimate:number; weeklyPaymentCount:number;
 recurringDeliveryCount:number; subscriptionCount:number; isPremium:boolean; priceChangeCount:number;
 savingsEstimate:number; calculatorSelectedCount:number; calculatorAmount:number;
 showSpendingDetail:boolean; showYearlyDetail:boolean; showRecurringDeliveryDetail:boolean;
 showSubscriptionDetail:boolean; showPriceStatusDetail:boolean; showSavingsDetail:boolean;
 showSpecificSpendCalculator:boolean;
 toggleSpending:()=>void; toggleYearly:()=>void; toggleDelivery:()=>void; toggleSubscription:()=>void;
 togglePrice:()=>void; toggleSavings:()=>void; toggleCalculator:()=>void;
}
export default function DashboardSummaryBoard(p:Props) {
 const {currentMonthNum,monthlySpendEstimate,yearlySpendEstimate,weeklyPaymentCount,recurringDeliveryCount,
 subscriptionCount,isPremium,priceChangeCount,savingsEstimate,calculatorSelectedCount,calculatorAmount,
 showSpendingDetail,showYearlyDetail,showRecurringDeliveryDetail,showSubscriptionDetail,showPriceStatusDetail,
 showSavingsDetail,showSpecificSpendCalculator}=p;
 const setShowSpendingDetail:Dispatch<SetStateAction<boolean>>=()=>p.toggleSpending(); const setShowYearlyDetail:Dispatch<SetStateAction<boolean>>=()=>p.toggleYearly();
 const setShowRecurringDeliveryDetail:Dispatch<SetStateAction<boolean>>=()=>p.toggleDelivery(); const setShowSubscriptionDetail:Dispatch<SetStateAction<boolean>>=()=>p.toggleSubscription();
 const setShowPriceStatusDetail:Dispatch<SetStateAction<boolean>>=()=>p.togglePrice(); const setShowSavingsDetail:Dispatch<SetStateAction<boolean>>=()=>p.toggleSavings();
 const setShowSpecificSpendCalculator:Dispatch<SetStateAction<boolean>>=()=>p.toggleCalculator();
 const calculatorSelectedItems={length:calculatorSelectedCount};
 return (
    <div className="summary-board">
      <button
        type="button"
        className="summary-board__tile summary-board__tile--spending summary-board__tile--clickable"
        onClick={() => setShowSpendingDetail((v) => !v)}
        aria-expanded={showSpendingDetail}
      >
        <span className="summary-board__icon" aria-hidden="true">💳</span>
        <div className="summary-board__text">
          <span className="summary-board__label">{currentMonthNum}월 예상지출</span>
          <span className="summary-board__value mono">
            {monthlySpendEstimate.toLocaleString('ko-KR')}
            <span className="summary-board__unit">원</span>
          </span>
        </div>
        <span className="summary-board__chevron" aria-hidden="true">{showSpendingDetail ? '▲' : '▾'}</span>
      </button>
      <button
        type="button"
        className="summary-board__tile summary-board__tile--yearly summary-board__tile--clickable"
        onClick={() => setShowYearlyDetail((v) => !v)}
        aria-expanded={showYearlyDetail}
      >
        <span className="summary-board__icon" aria-hidden="true">📈</span>
        <div className="summary-board__text">
          <span className="summary-board__label">올해 예상 지출</span>
          <span className="summary-board__value mono">
            {yearlySpendEstimate.toLocaleString('ko-KR')}
            <span className="summary-board__unit">원</span>
          </span>
        </div>
        <span className="summary-board__chevron" aria-hidden="true">{showYearlyDetail ? '▲' : '▾'}</span>
      </button>
      <div className="summary-board__tile summary-board__tile--week">
        <span className="summary-board__icon" aria-hidden="true">📅</span>
        <div className="summary-board__text">
          <span className="summary-board__label">이번 주 결제 완료</span>
          <span className="summary-board__value mono">
            {weeklyPaymentCount}
            <span className="summary-board__unit">건</span>
          </span>
          <span className="summary-board__unit summary-board__value-caption">월~오늘 기준</span>
        </div>
      </div>
      <button
        type="button"
        className="summary-board__tile summary-board__tile--delivery summary-board__tile--clickable"
        onClick={() => setShowRecurringDeliveryDetail((v) => !v)}
        aria-expanded={showRecurringDeliveryDetail}
      >
        <span className="summary-board__icon" aria-hidden="true">📦</span>
        <div className="summary-board__text">
          <span className="summary-board__label">정기배송</span>
          <span className="summary-board__value mono">
            {recurringDeliveryCount}
            <span className="summary-board__unit">건</span>
          </span>
        </div>
        <span className="summary-board__chevron" aria-hidden="true">{showRecurringDeliveryDetail ? '▲' : '▾'}</span>
      </button>
      <button
        type="button"
        className="summary-board__tile summary-board__tile--subscription summary-board__tile--clickable"
        onClick={() => setShowSubscriptionDetail((v) => !v)}
        aria-expanded={showSubscriptionDetail}
      >
        <span className="summary-board__icon" aria-hidden="true">🔄</span>
        <div className="summary-board__text">
          <span className="summary-board__label">정기구독</span>
          <span className="summary-board__value mono">
            {subscriptionCount}
            <span className="summary-board__unit">건</span>
          </span>
        </div>
        <span className="summary-board__chevron" aria-hidden="true">{showSubscriptionDetail ? '▲' : '▾'}</span>
      </button>
      {/* 인상 감지/절약 제안 둘 다 "평소엔 숨겨져 있다가 있을 때만 뜨는" 방식이면 사용자가 그런
          기능이 있는지조차 모르기 쉬워서, 값이 0이어도(비어있어도) 상시 표시한다. */}
      {isPremium ? (
        <button
          type="button"
          className="summary-board__tile summary-board__tile--price-change summary-board__tile--clickable"
          onClick={() => setShowPriceStatusDetail((v) => !v)}
          aria-expanded={showPriceStatusDetail}
        >
          <span className="summary-board__icon" aria-hidden="true">⚠</span>
          <div className="summary-board__text">
            <span className="summary-board__label">가격 변동 감지</span>
            <span className="summary-board__value mono">
              {priceChangeCount}
              <span className="summary-board__unit">건</span>
            </span>
          </div>
          <span className="summary-board__chevron" aria-hidden="true">{showPriceStatusDetail ? '▲' : '▾'}</span>
        </button>
      ) : (
        <Link to="/pricing" className="summary-board__tile summary-board__tile--price-change summary-board__tile--clickable">
          <span className="summary-board__icon" aria-hidden="true">⚠</span>
          <div className="summary-board__text">
            <span className="summary-board__label">가격 변동 감지</span>
            <span className="summary-board__ai-cta">🔒 프리미엄 전용</span>
          </div>
        </Link>
      )}
      <button
        type="button"
        className="summary-board__tile summary-board__tile--savings summary-board__tile--clickable"
        onClick={() => setShowSavingsDetail((v) => !v)}
        aria-expanded={showSavingsDetail}
      >
        <span className="summary-board__icon" aria-hidden="true">💡</span>
        <div className="summary-board__text">
          <span className="summary-board__label">AI 절약 제안</span>
          <span className="summary-board__value mono">
            {savingsEstimate.toLocaleString('ko-KR')}원
          </span>
          <span className="summary-board__unit summary-board__value-caption">절약 가능</span>
        </div>
        <span className="summary-board__chevron" aria-hidden="true">{showSavingsDetail ? '▲' : '▾'}</span>
      </button>
      <button
        type="button"
        className="summary-board__tile summary-board__tile--calculator summary-board__tile--clickable"
        onClick={() => setShowSpecificSpendCalculator((v) => !v)}
        aria-expanded={showSpecificSpendCalculator}
      >
        <span className="summary-board__icon" aria-hidden="true">🧮</span>
        <div className="summary-board__text">
          <span className="summary-board__label">특정 지출 계산기</span>
          <span className="summary-board__value mono">
            {calculatorAmount.toLocaleString('ko-KR')}원
          </span>
          <span className="summary-board__unit summary-board__value-caption">이번 달</span>
        </div>
        <span className="summary-board__chevron" aria-hidden="true">{showSpecificSpendCalculator ? '▲' : '▾'}</span>
      </button>
    </div>
 );
}

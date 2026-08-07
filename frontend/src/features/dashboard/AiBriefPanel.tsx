import { Link } from 'react-router-dom';
import type { AiBriefData } from './useAiBrief';

interface AiBriefPanelProps {
  loaded: boolean;
  purchaseCount: number;
  isPremium: boolean;
  brief: AiBriefData | null;
  loading: boolean;
  onAnalyze: () => void;
  onCollapse: () => void;
}

export default function AiBriefPanel({
  loaded: purchasesLoaded,
  purchaseCount,
  isPremium,
  brief: aiBrief,
  loading: aiBriefTextLoading,
  onAnalyze: handleAiSummary,
  onCollapse,
}: AiBriefPanelProps) {
  const purchases = { length: purchaseCount };
  const setAiBrief = (value: null) => { if (value === null) onCollapse(); };
  return (
    <>
    {purchasesLoaded && purchases.length > 0 && !isPremium && (
      <Link
        to="/pricing"
        className="ai-summary-section summary-board__tile summary-board__tile--ai-summary summary-board__tile--clickable"
      >
        <span className="summary-board__icon" aria-hidden="true">🤖</span>
        <div className="summary-board__text">
          <span className="summary-board__label">AI 소비 매니저</span>
          <span className="summary-board__ai-cta">🔒 프리미엄으로 업그레이드하면 이용할 수 있어요</span>
        </div>
      </Link>
    )}

    {purchasesLoaded && purchases.length > 0 && isPremium && (
      <div
        className="ai-summary-section summary-board__tile summary-board__tile--ai-summary summary-board__tile--clickable"
      >
        {aiBrief ? (
          <div className="ai-brief">
            <div className="ai-brief__header">
              <button type="button" className="ai-brief__header-toggle" onClick={() => setAiBrief(null)} aria-label="AI 소비 매니저 접기">
                <span>🤖 AI 소비 매니저 <span className="ai-brief__header-sub">· 오늘의 브리핑</span></span>
                <span aria-hidden="true">⌃</span>
              </button>
              <button type="button" className="ai-brief__refresh" onClick={handleAiSummary} disabled={aiBriefTextLoading}>
                {aiBriefTextLoading ? '분석 중...' : '↻ 다시 분석'}
              </button>
            </div>
            <div className="ai-brief__divider" />
            {/* "AI가 매기는 점수"처럼 보이지만 실제로는 가격 인상/미사용 의심/지출 급증/과다구독
                신호를 규칙으로 점수화한 결정론적 지수 — computeHealthScore 참고. */}
            <div className="ai-brief__health">
              <span
                className={`ai-brief__health-badge${
                  aiBrief.healthScore >= 80
                    ? ' ai-brief__health-badge--good'
                    : aiBrief.healthScore >= 50
                      ? ' ai-brief__health-badge--warn'
                      : ' ai-brief__health-badge--bad'
                }`}
              >
                {aiBrief.healthScore >= 80 ? '🟢 매우 양호' : aiBrief.healthScore >= 50 ? '🟡 보통' : '🔴 점검 필요'}
              </span>
              <span className="ai-brief__health-label">소비 건강도</span>
              <strong className="ai-brief__health-score">{aiBrief.healthScore}점</strong>
            </div>
            {aiBrief.healthBreakdown.length > 0 && (
              <ul className="ai-brief__health-breakdown">
                {aiBrief.healthBreakdown.map((factor) => (
                  <li key={factor.label}>
                    <span>⚠️ {factor.label}</span>
                    <span className="ai-brief__health-breakdown-delta">{factor.delta}점</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="ai-brief__metrics">
              <div className="ai-brief__metric">
                <span className="ai-brief__metric-label">💰 이번 달 예상</span>
                <strong className="ai-brief__metric-value">{aiBrief.monthlySpend.toLocaleString('ko-KR')}원</strong>
              </div>
              <div className="ai-brief__metric">
                <span className="ai-brief__metric-label">📦 구독 수</span>
                <strong className="ai-brief__metric-value">{aiBrief.totalRecurring}개</strong>
              </div>
              {aiBrief.trendPct !== null && (
                <div className="ai-brief__metric">
                  <span className="ai-brief__metric-label">📈 전월 대비</span>
                  <strong className={`ai-brief__metric-value${aiBrief.trendPct > 0 ? ' ai-brief__metric-value--up' : ' ai-brief__metric-value--down'}`}>
                    {aiBrief.trendPct > 0 ? '+' : ''}{aiBrief.trendPct}%
                  </strong>
                </div>
              )}
              {aiBrief.topCategory && (
                <div className="ai-brief__metric">
                  <span className="ai-brief__metric-label">🏆 최다 지출 카테고리</span>
                  <strong className="ai-brief__metric-value ai-brief__metric-value--cat">
                    {aiBrief.topCategory}
                  </strong>
                  <span className="ai-brief__metric-cat-amount">
                    {(aiBrief.topCategoryAmount ?? 0).toLocaleString('ko-KR')}원
                  </span>
                </div>
              )}
            </div>
            {/* AI가 지어낸 문장이 아니라 실제 데이터로 계산한 사실 그대로(결정론적) — 날짜·
                서비스명·건수처럼 틀리면 안 되는 값은 여기서 직접 채운다. */}
            <div className="ai-brief__checklist">
              <div className="ai-brief__check">
                <span className={`ai-brief__check-mark${aiBrief.priceChangeItems.length > 0 ? ' ai-brief__check-mark--warn' : ''}`}>
                  {aiBrief.priceChangeItems.length > 0 ? '⚠' : '✔'}
                </span>
                <span className="ai-brief__check-label">가격 변동</span>
                <span className="ai-brief__check-detail">
                  {aiBrief.priceChangeItems.length > 0 ? aiBrief.priceChangeItems.join(', ') : '없음'}
                </span>
              </div>
              <div className="ai-brief__check">
                <span className={`ai-brief__check-mark${aiBrief.unusedServiceItems.length > 0 ? ' ai-brief__check-mark--warn' : ''}`}>
                  {aiBrief.unusedServiceItems.length > 0 ? '⚠' : '✔'}
                </span>
                <span className="ai-brief__check-label">이용 상태 확인 필요</span>
                <span className="ai-brief__check-detail">
                  {aiBrief.unusedServiceItems.length > 0 ? aiBrief.unusedServiceItems.join(', ') : '없음'}
                </span>
              </div>
              <div className="ai-brief__check">
                <span className="ai-brief__check-mark">🎯</span>
                <span className="ai-brief__check-label">다음 확인 서비스</span>
                <span className="ai-brief__check-detail">
                  {aiBrief.nextPaymentItem && aiBrief.nextPaymentDDay !== null ? (
                    <>
                      {aiBrief.nextPaymentItem} (
                      {aiBrief.nextPaymentDDay <= 0 ? '오늘' : aiBrief.nextPaymentDDay === 1 ? '내일' : `${aiBrief.nextPaymentDDay}일 후`} 결제)
                    </>
                  ) : (
                    '예정된 결제 없음'
                  )}
                </span>
              </div>
              <div className="ai-brief__check">
                <span className={`ai-brief__check-mark${aiBrief.savingsEstimate > 0 ? ' ai-brief__check-mark--warn' : ''}`}>
                  {aiBrief.savingsEstimate > 0 ? '💡' : '✔'}
                </span>
                <span className="ai-brief__check-label">이번 달 절약 가능성</span>
                <span className="ai-brief__check-detail">
                  {aiBrief.savingsEstimate > 0 ? `약 ${aiBrief.savingsEstimate.toLocaleString('ko-KR')}원` : '없음'}
                </span>
              </div>
              {aiBrief.nextPaymentItem && (
                <p className="ai-brief__checklist-hint">
                  자동 결제를 유지할지 확인해보세요 — 가격 변동이 있었다면 확인 대기 목록에서 함께 볼 수 있어요.
                </p>
              )}
            </div>
            {aiBrief.actionItems.length > 0 && (
              <div className="ai-brief__actions">
                <span className="ai-brief__section-label">⚡ AI 추천 절약 액션</span>
                <ul className="ai-brief__action-list">
                  {aiBrief.actionItems.map((item, i) => (
                    <li
                      key={`${item.kind}-${item.itemName}-${i}`}
                      className={`ai-brief__action-item ai-brief__action-item--${item.kind.toLowerCase().replace(/_/g, '-')}${item.kind === 'PRICE_CHANGE' && !item.isIncrease ? ' ai-brief__action-item--price-decrease' : ''}`}
                    >
                      <span className="ai-brief__action-icon" aria-hidden="true">
                        {item.kind === 'PRICE_CHANGE' ? (item.isIncrease ? '⚠' : '👍') : item.kind === 'UPCOMING_PAYMENT' ? '🔔' : '💳'}
                      </span>
                      <span className="ai-brief__action-text">
                        <strong>{item.itemName}</strong> — {item.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {aiBriefTextLoading ? (
              <div className="ai-brief__text-loading">AI 분석 중...</div>
            ) : (
              <>
                <div className="ai-brief__section">
                  <span className="ai-brief__section-label">🤖 AI 분석 결과</span>
                  <p className="ai-brief__section-text">{aiBrief.goodNews ?? '—'}</p>
                </div>
                <div className="ai-brief__section">
                  <span className="ai-brief__section-label">👀 눈여겨볼 점</span>
                  <p className="ai-brief__section-text">{aiBrief.attention ?? '특별한 주의사항 없음'}</p>
                </div>
                {aiBrief.insight && (
                  <div className="ai-brief__insight">💡 {aiBrief.insight}</div>
                )}
                {aiBrief.annualSavingsSuggestion && (
                  <div className="ai-brief__section ai-brief__section--savings">
                    <span className="ai-brief__section-label">💰 연간 결제 절약 제안</span>
                    <p className="ai-brief__section-text">{aiBrief.annualSavingsSuggestion}</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <button type="button" className="ai-summary-section__trigger" onClick={handleAiSummary}>
            <span className="summary-board__icon" aria-hidden="true">🤖</span>
            <div className="summary-board__text">
              <span className="summary-board__label">AI 소비 매니저</span>
              <span className="summary-board__ai-cta">눌러서 소비 패턴 분석하기</span>
            </div>
          </button>
        )}
      </div>
    )}
    </>
  );
}

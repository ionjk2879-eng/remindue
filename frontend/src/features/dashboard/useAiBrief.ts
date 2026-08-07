import { useRef, useState } from 'react';
import { fetchAiSummary, type AiBriefSections, type AiSummaryInput } from '../../api/purchases';
import type { PendingPurchase, Purchase } from '../../types';
import { isRecurringType } from '../../types';
import type { FxCardBrand, FxCardIssuer } from '../../api/settings';
import { CATEGORY_LABEL, PURCHASE_CATEGORIES, URGENT_WINDOW_DAYS } from './dashboardModel';
import { occurrencesInMonth, todayDateOnly, totalSpendInMonth } from '../../components/dashboard/dashboardUtils';

export interface AiBriefData extends AiBriefSections {
  month: number; monthlySpend: number; yearlySpend: number; totalRecurring: number;
  topCategory: string | null; topCategoryAmount: number | null; trendPct: number | null;
  reviewCount: number; nextPaymentDate: string | null; nextPaymentItem: string | null;
  priceChangeItems: string[]; unusedServiceItems: string[]; nextPaymentDDay: number | null;
  savingsEstimate: number; healthScore: number; healthBreakdown: { label: string; delta: number }[];
  actionItems: { kind: 'PRICE_CHANGE' | 'UPCOMING_PAYMENT' | 'CARD_SAVINGS'; itemName: string; detail: string; isIncrease?: boolean }[];
}
interface UseAiBriefOptions {
  purchases: Purchase[]; spendHistoryPurchases: Purchase[]; reviewCount: number;
  priceUpItems: Purchase[]; unusedItems: Purchase[];
  pendingPriceChangeByPurchaseId: Map<number, PendingPurchase>; savingsEstimate: number;
  fxCardSettings: { fxCardIssuer: FxCardIssuer | null; fxCardBrand: FxCardBrand | null } | null;
}
export function useAiBrief({
  purchases, spendHistoryPurchases, reviewCount, priceUpItems, unusedItems,
  pendingPriceChangeByPurchaseId, savingsEstimate, fxCardSettings,
}: UseAiBriefOptions) {
  const [aiBrief, setAiBrief] = useState<AiBriefData | null>(null);
  const [aiBriefTextLoading, setAiBriefTextLoading] = useState(false);
  const aiSummaryInFlightRef = useRef(false);
  const monthlyEquivalent = (purchase: Purchase) => purchase.scheduleType === 'FIXED_DAY'
    ? purchase.amount!
    : (purchase.amount! * 30) / (purchase.intervalDays || 30);

  const handleAiSummary = () => {
    if (aiSummaryInFlightRef.current) return;
    aiSummaryInFlightRef.current = true;
    const today = todayDateOnly();
    const [yr, mo] = today.split('-').map(Number);
    // "한 번만 사용"은 해당 구독의 첫 달까지 관리 대상이므로 포함한다. 다만 "유지 안 함"은
    // 다음 갱신부터 중단된 상태라 구독 수·AI 분석 대상에서 제외한다.
    const rcCount = purchases.filter((p) => p.type === 'RECURRING_DELIVERY' && p.discontinuedAt === null).length;
    const subCount = purchases.filter((p) => p.type === 'SUBSCRIPTION' && p.discontinuedAt === null).length;
    const totalRecurring = rcCount + subCount;
    // 요약 카드와 AI 소비 매니저의 수치가 달라지지 않도록, 일반 구매와 정기 항목을 포함하는
    // 대시보드의 월별 지출 계산(totalSpendInMonth)을 그대로 사용한다.
    const moSpend = totalSpendInMonth(spendHistoryPurchases, yr, mo);
    const yrSpend = Array.from({ length: 12 }, (_, i) =>
      totalSpendInMonth(spendHistoryPurchases, yr, i + 1),
    ).reduce((a, b) => a + b, 0);
    const prevMoSpend = totalSpendInMonth(spendHistoryPurchases, mo === 1 ? yr - 1 : yr, mo === 1 ? 12 : mo - 1);
    const trendPct = prevMoSpend > 0 ? Math.round(((moSpend - prevMoSpend) / prevMoSpend) * 100) : null;

    const catAmounts = PURCHASE_CATEGORIES.map((cat) => {
      const total = spendHistoryPurchases
        .filter((p) => p.category === cat && p.amount !== null)
        .reduce((sum, p) => {
          if (isRecurringType(p.type)) return sum + occurrencesInMonth(p, yr, mo) * p.amount!;
          const [baseYear, baseMonth] = p.baseDate.split('-').map(Number);
          return baseYear === yr && baseMonth === mo ? sum + p.amount! : sum;
        }, 0);
      return { cat, total: Math.round(total) };
    }).filter((c) => c.total > 0);
    const topCat = catAmounts.sort((a, b) => b.total - a.total)[0] ?? null;

    // reviewCandidates(컴포넌트 상단, 절약 후보 확정 기준)를 그대로 재사용 — 기준이 어긋나지 않게.
    const topCatLabel = topCat ? CATEGORY_LABEL[topCat.cat] : null;

    // 다음 결제/배송(가장 가까운 paymentDDay의 정기배송·구독) — AI가 아니라 실제 데이터로 직접
    // 계산한다(날짜·이름은 모델이 지어내면 안 되는 값이라서). dDay가 아니라 paymentDDay를 쓰는
    // 이유: dDay는 결제완료·도착대기 상태일 때 도착일 기준으로 바뀌어 있어서, "다음 결제"를
    // 뽑는 데 쓰면 이미 결제된 항목이 뽑힐 수 있다. 가격 인상/사용 안 함 항목은 "가격 인상" 타일의
    // 3분류 계산(priceUpItems/unusedItems, 컴포넌트 상단에서 이미 계산됨)을 그대로 재사용한다.
    const upcoming = purchases
      // 한 번만 사용하는 항목과 이미 "유지 안 함"으로 끝낸 항목은 자동 결제를
      // 확인할 대상이 아니다. 목록에는 이력을 위해 남아도 소비 매니저의 다음
      // 확인 서비스 후보에는 넣지 않는다.
      .filter((p) => isRecurringType(p.type) && !p.isOneTime && p.discontinuedAt === null)
      .sort((a, b) => a.paymentDDay - b.paymentDDay)[0] ?? null;
    const priceChangeItems = priceUpItems.map((p) => p.itemName);
    const unusedServiceItems = unusedItems.map((p) => p.itemName);

    // 월 단위 구독 목록 — 연간 플랜 절약 제안용. 정기배송(RECURRING_DELIVERY)은 제외하고
    // 구독(SUBSCRIPTION)만 포함. 삭제·유지안함·한번만사용은 이미 소비 매니저 분석 대상 밖.
    const subscriptionItems = purchases
      .filter(
        (p) =>
          p.type === 'SUBSCRIPTION' &&
          !p.isOneTime &&
          p.discontinuedAt === null &&
          p.discardedAt === null &&
          p.amount !== null,
      )
      .map((p) => ({
        name: p.brand ? `${p.brand} ${p.itemName}`.trim() : p.itemName,
        monthlyAmount: Math.round(monthlyEquivalent(p)),
      }));

    /**
     * priceUpItems는 이름과 달리 인상/인하를 둘 다 포함한다(priceChangePurchaseIds가 방향을
     * 안 가려서). 건강도 점수·"AI 추천 절약 액션"은 방향이 중요해서(가격이 내렸는데 감점되면
     * 안 됨) 여기서 한 번에 방향까지 계산해두고 아래에서 재사용한다.
     */
    const priceChangeDetails = priceUpItems
      .map((p) => {
        const pending = pendingPriceChangeByPurchaseId.get(p.id);
        const previousAmount = pending ? pending.previousAmount! : p.priceChangePreviousAmount;
        const currentAmount = pending ? pending.amount! : p.amount;
        if (previousAmount === null || currentAmount === null || previousAmount === currentAmount) return null;
        return { purchase: p, previousAmount, currentAmount, isIncrease: currentAmount > previousAmount };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const priceIncreaseCount = priceChangeDetails.filter((item) => item.isIncrease).length;

    // "AI 소비 건강도" — 실제로는 AI가 아니라 위 신호들을 규칙 기반으로 점수화한 결정론적 지수.
    // 100점에서 시작해 가격 인상·미사용 의심·급격한 지출 증가·과다구독일 때 깎는다. 가격이
    // 내린 건 좋은 신호라 감점 대상이 아니다 — priceIncreaseCount(인상만)로만 깎는다.
    let healthScore = 100;
    const healthBreakdown: { label: string; delta: number }[] = [];
    const priceUpDeduction = Math.min(priceIncreaseCount * 15, 30);
    if (priceUpDeduction > 0) {
      healthScore -= priceUpDeduction;
      healthBreakdown.push({ label: `가격 인상 감지 ${priceIncreaseCount}건`, delta: -priceUpDeduction });
    }
    const unusedDeduction = Math.min(unusedItems.length * 15, 30);
    if (unusedDeduction > 0) {
      healthScore -= unusedDeduction;
      healthBreakdown.push({ label: `이용 상태 미확인 ${unusedItems.length}건`, delta: -unusedDeduction });
    }
    if (trendPct !== null && trendPct >= 50) {
      healthScore -= 20;
      healthBreakdown.push({ label: `지출 급증 (전월 대비 +${trendPct}%)`, delta: -20 });
    } else if (trendPct !== null && trendPct >= 20) {
      healthScore -= 10;
      healthBreakdown.push({ label: `지출 증가 (전월 대비 +${trendPct}%)`, delta: -10 });
    }
    if (totalRecurring >= 15) {
      healthScore -= 10;
      healthBreakdown.push({ label: `구독 과다 (${totalRecurring}개)`, delta: -10 });
    } else if (totalRecurring >= 10) {
      healthScore -= 5;
      healthBreakdown.push({ label: `구독 다수 (${totalRecurring}개)`, delta: -5 });
    }
    healthScore = Math.max(0, Math.min(100, healthScore));

    /**
     * "AI 추천 절약 액션" — 가격 변동/결제 임박 미확인/카드 최적화를 하나의 우선순위 리스트로
     * 합친다. 셋 다 결정론적 계산값(모델이 지어내는 문장이 아님)이라 금액·날짜를 그대로 보여준다.
     */
    const priceChangeActionItems = priceChangeDetails.map(({ purchase, previousAmount, currentAmount, isIncrease }) => {
      const delta = currentAmount - previousAmount;
      return {
        kind: 'PRICE_CHANGE' as const,
        itemName: purchase.itemName,
        isIncrease,
        detail: `${previousAmount.toLocaleString('ko-KR')}원 → ${currentAmount.toLocaleString('ko-KR')}원 (${isIncrease ? '인상' : '인하'} ${isIncrease ? '+' : ''}${delta.toLocaleString('ko-KR')}원)`,
      };
    });

    // "최근 이용 빈도"는 이 앱에 없는 데이터라(결제/등록 기록만 있음), 대신 있는 데이터인
    // "유지 확인을 아직 안 함"으로 표현한다 — 실제로 안 쓰는지는 모르니 단정하지 않는다.
    const upcomingUnconfirmedActionItems = purchases
      .filter(
        (p) =>
          isRecurringType(p.type) && !p.isOneTime && p.discontinuedAt === null &&
          p.paymentDDay >= 0 && p.paymentDDay <= URGENT_WINDOW_DAYS &&
          p.renewalDecisionFor !== p.deadline
      )
      .sort((a, b) => a.paymentDDay - b.paymentDDay)
      .slice(0, 3)
      .map((p) => ({
        kind: 'UPCOMING_PAYMENT' as const,
        itemName: p.itemName,
        detail: `${p.paymentDDay === 0 ? '오늘' : p.paymentDDay === 1 ? '내일' : `${p.paymentDDay}일 후`} 결제 예정 — 아직 유지 확인 전이에요.`,
      }));

    // 사용자가 설정에서 카드를 고른 경우에만 계산한다 — 안 골랐으면 평균 마진 근사치라 "이 카드로
    // 바꾸세요"라고 자신 있게 말하기엔 정확도가 떨어진다.
    const cardSavingsActionItems = fxCardSettings?.fxCardIssuer
      ? purchases
          .filter(
            (p) =>
              isRecurringType(p.type) && !p.isOneTime && p.discontinuedAt === null &&
              p.originalCurrency !== null && p.originalAmount !== null && p.amount !== null
          )
          .map((p) => {
            const travelAmount = p.travelCardAmount;
            if (travelAmount === null) return null;
            const savings = Math.round(p.amount! - travelAmount);
            if (savings <= 0) return null;
            const monthlySavings = Math.round(monthlyEquivalent(p) * (savings / p.amount!));
            return { itemName: p.itemName, monthlySavings };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.monthlySavings - a.monthlySavings)
          .slice(0, 3)
          .map((item) => ({
            kind: 'CARD_SAVINGS' as const,
            itemName: item.itemName,
            detail: `트래블 카드로 바꾸면 월 약 ${item.monthlySavings.toLocaleString('ko-KR')}원 절약 가능해요.`,
          }))
      : [];

    const actionItems = [...priceChangeActionItems, ...upcomingUnconfirmedActionItems, ...cardSavingsActionItems].slice(0, 6);

    // Show card with metrics immediately, text sections loading
    setAiBrief({
      month: mo,
      monthlySpend: Math.round(moSpend),
      yearlySpend: Math.round(yrSpend),
      totalRecurring,
      topCategory: topCatLabel,
      topCategoryAmount: topCat?.total ?? null,
      nextPaymentDate: upcoming?.deadline ?? null,
      nextPaymentItem: upcoming?.itemName ?? null,
      nextPaymentDDay: upcoming?.paymentDDay ?? null,
      priceChangeItems,
      unusedServiceItems,
      savingsEstimate,
      healthScore,
      healthBreakdown,
      actionItems,
      trendPct,
      reviewCount,
      goodNews: null,
      attention: null,
      insight: null,
      annualSavingsSuggestion: null,
    });
    setAiBriefTextLoading(true);

    const fmtWon = (n: number) => n.toLocaleString('ko-KR');

    const buildFallback = (): AiBriefSections => {
      let goodNews: string;
      if (totalRecurring === 0) goodNews = '아직 정기 구독이 등록되어 있지 않습니다.';
      else if (trendPct !== null && trendPct <= -10)
        goodNews = `전월 대비 ${Math.abs(trendPct)}% 줄어 ${fmtWon(Math.round(moSpend))}원이 예상됩니다. 잘 관리하고 있어요!`;
      else if (Math.round(moSpend) < 30000)
        goodNews = `${mo}월 예상 지출은 ${fmtWon(Math.round(moSpend))}원으로 부담이 크지 않습니다.`;
      else if (totalRecurring <= 3)
        goodNews = `${totalRecurring}개의 구독을 관리 중으로 현재 관리하기 쉬운 상태입니다.`;
      else goodNews = `${mo}월 예상 지출은 ${fmtWon(Math.round(moSpend))}원입니다.`;

      // 좋은소식과 나란히 "2개"로 항상 보여주기로 했으니, 특별히 우려되는 점이 없어도
      // 마지막 else에서 참고용 문구를 채워 null이 되지 않게 한다.
      let attention: string;
      if (reviewCount > 0) {
        const perItem = totalRecurring > 0 ? Math.round(moSpend / totalRecurring) : 0;
        const savingEst = perItem * reviewCount * 12;
        attention = `최근 유지 확인이 없는 구독이 ${reviewCount}개 있습니다. 해지하면 연간 약 ${fmtWon(savingEst)}원 절약 가능.`;
      } else if (trendPct !== null && trendPct >= 20) {
        attention = `이번 달 지출이 전월 대비 ${trendPct}% 늘었습니다. 새로 추가된 구독을 확인해보세요.`;
      } else if (totalRecurring >= 10) {
        attention = `현재 ${totalRecurring}개의 구독이 활성화되어 있습니다. 주기적으로 점검해보세요.`;
      } else {
        attention = '특별히 우려되는 점은 없습니다. 그래도 주기적으로 구독 현황을 점검해보세요.';
      }

      let insight: string;
      if (totalRecurring === 0) insight = '구독을 추가하면 월별 지출 추이와 갱신일을 자동으로 추적해드릴게요.';
      else if (reviewCount > 0) insight = '미사용 구독을 정리하면 연간 지출을 의미 있게 줄일 수 있어요.';
      else if (trendPct !== null && trendPct > 10) insight = '지출이 늘고 있어요. 최근 추가한 구독이 있는지 확인해보세요.';
      else if (trendPct !== null && trendPct < -10) insight = '지출이 줄고 있어요. 현재 소비 패턴을 유지하면 좋겠어요.';
      else insight = '이번 달 지출 패턴은 안정적입니다.';

      return { goodNews, attention, insight, annualSavingsSuggestion: null };
    };

    const input: AiSummaryInput = {
      month: mo,
      recurringDeliveryCount: rcCount,
      subscriptionCount: subCount,
      monthlySpend: Math.round(moSpend),
      yearlySpend: Math.round(yrSpend),
      monthTrendPercent: trendPct,
      topCategory: topCatLabel,
      topCategoryAmount: topCat?.total ?? null,
      topCategoryShare: topCat && moSpend > 0 ? Math.round((topCat.total / moSpend) * 100) : null,
      reviewCount,
      totalItems: purchases.length,
      nextPaymentDate: upcoming?.deadline ?? null,
      nextPaymentItem: upcoming?.itemName ?? null,
      priceChangeItems,
      subscriptionItems,
    };

    fetchAiSummary(input)
      .then((sections) => {
        const resolved: AiBriefSections =
          sections.goodNews || sections.insight
            ? sections
            : buildFallback();
        setAiBrief((prev) => (prev ? { ...prev, ...resolved } : prev));
      })
      .catch(() => {
        setAiBrief((prev) => (prev ? { ...prev, ...buildFallback() } : prev));
      })
      .finally(() => {
        aiSummaryInFlightRef.current = false;
        setAiBriefTextLoading(false);
      });
  };


  return { aiBrief, setAiBrief, aiBriefTextLoading, handleAiSummary };
}

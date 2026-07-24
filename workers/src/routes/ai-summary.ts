import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

interface SpendingSummaryInput {
  month: number;
  recurringDeliveryCount: number;
  subscriptionCount: number;
  monthlySpend: number;
  yearlySpend: number;
  monthTrendPercent: number | null;
  topCategory: string | null;
  topCategoryAmount: number | null;
  reviewCount: number;
  totalItems: number;
}

const aiSummary = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
aiSummary.use('*', authMiddleware);

aiSummary.post('/spending-summary', async (c) => {
  try {
    const body = await c.req.json<SpendingSummaryInput>();
    const {
      month,
      recurringDeliveryCount,
      subscriptionCount,
      monthlySpend,
      yearlySpend,
      monthTrendPercent,
      topCategory,
      topCategoryAmount,
      reviewCount,
    } = body;

    const fmt = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    const trendText =
      monthTrendPercent !== null
        ? monthTrendPercent > 0
          ? `전월 대비 ${monthTrendPercent}% 증가`
          : monthTrendPercent < 0
            ? `전월 대비 ${Math.abs(monthTrendPercent)}% 감소`
            : '전월과 지출 동일'
        : null;

    const lines = [
      `- 정기배송: ${recurringDeliveryCount}건`,
      `- 정기구독: ${subscriptionCount}건`,
      `- ${month}월 예상 지출: ${fmt(monthlySpend)}원${trendText ? ` (${trendText})` : ''}`,
      `- 올해 예상 총 지출: ${fmt(yearlySpend)}원`,
      topCategory && topCategoryAmount !== null
        ? `- 이번 달 최다 지출 카테고리: ${topCategory} (${fmt(topCategoryAmount)}원)`
        : null,
      reviewCount > 0 ? `- 6개월 이상 미확인 구독: ${reviewCount}건` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content:
            '당신은 가계부 소비 패턴을 분석하는 도우미입니다. 제공된 데이터를 바탕으로 2~3문장의 자연스러운 한국어 소비 요약을 작성하세요. 숫자를 단순 나열하지 말고 주목할 만한 패턴·인사이트를 담아 친근한 말투로 써주세요. 마크다운이나 추가 설명 없이 요약 텍스트만 출력하세요.',
        },
        { role: 'user', content: lines },
      ],
    });

    const summary =
      typeof result === 'object' && result !== null && 'response' in result
        ? String((result as { response: unknown }).response).trim() || null
        : null;

    console.log('[ai-summary] ok, length:', summary?.length ?? 0);
    return c.json({ summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-summary] unexpected error:', msg);
    return c.json({ summary: null, error: msg }, 500);
  }
});

export default aiSummary;

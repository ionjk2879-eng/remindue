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

function parseTag(text: string, tag: string): string | null {
  for (const line of text.split('\n')) {
    const prefix = `${tag}:`;
    if (line.startsWith(prefix)) {
      const v = line.slice(prefix.length).trim();
      return v && v !== '없음' ? v : null;
    }
  }
  return null;
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

    const dataLines = [
      `- 정기배송: ${recurringDeliveryCount}건`,
      `- 정기구독: ${subscriptionCount}건`,
      `- ${month}월 예상 지출: ${fmt(monthlySpend)}원${trendText ? ` (${trendText})` : ''}`,
      `- 올해 예상 총 지출: ${fmt(yearlySpend)}원`,
      topCategory && topCategoryAmount !== null
        ? `- 이번 달 최다 지출 카테고리: ${topCategory} (${fmt(topCategoryAmount)}원)`
        : null,
      reviewCount > 0 ? `- 6개월 이상 수령 미확인 구독: ${reviewCount}건` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: `당신은 가계부 소비 패턴 분석 AI입니다.
아래 소비 데이터를 분석하여 정확히 이 형식으로만 답하세요 (마크다운, 추가 설명, 라벨 번역 없이):

좋은소식: (긍정적인 관찰 1~2문장, 한국어)
주의사항: (주의할 점 1~2문장, 한국어. 특별히 없으면 "없음")
인사이트: (핵심 제안 1문장, 한국어)`,
        },
        { role: 'user', content: dataLines },
      ],
    });

    const raw =
      typeof result === 'object' && result !== null && 'response' in result
        ? String((result as { response: unknown }).response).trim()
        : '';

    const goodNews = parseTag(raw, '좋은소식');
    const attention = parseTag(raw, '주의사항');
    const insight = parseTag(raw, '인사이트');

    console.log('[ai-summary] ok — good:', !!goodNews, 'attention:', !!attention, 'insight:', !!insight);
    return c.json({ goodNews, attention, insight });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-summary] unexpected error:', msg);
    return c.json({ goodNews: null, attention: null, insight: null, error: msg }, 500);
  }
});

export default aiSummary;

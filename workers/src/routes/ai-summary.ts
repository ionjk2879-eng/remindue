import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5';

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
    `- ${month}월 예상 지출: ${monthlySpend.toLocaleString('ko-KR')}원${trendText ? ` (${trendText})` : ''}`,
    `- 올해 예상 총 지출: ${yearlySpend.toLocaleString('ko-KR')}원`,
    topCategory && topCategoryAmount !== null
      ? `- 이번 달 최다 지출 카테고리: ${topCategory} (${topCategoryAmount.toLocaleString('ko-KR')}원)`
      : null,
    reviewCount > 0
      ? `- 6개월 이상 미확인 구독: ${reviewCount}건`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `당신은 가계부 소비 패턴을 분석하는 도우미입니다. 아래 데이터를 바탕으로 2~3문장의 자연스러운 한국어 소비 요약을 작성하세요. 숫자를 단순 나열하지 말고 주목할 만한 패턴·인사이트를 담아 친근한 말투로 써주세요. 마크다운 없이 텍스트만 출력하세요.

${lines}`;

  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': c.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[ai-summary] Anthropic API error ${res.status}:`, errText);
    return c.json({ summary: null, error: `API error ${res.status}` }, 500);
  }

  const data = await res.json<{ content: { type: string; text: string }[] }>();
  const summary = data.content?.[0]?.text?.trim() ?? null;
  console.log('[ai-summary] generated summary length:', summary?.length ?? 0);
  return c.json({ summary });
});

export default aiSummary;

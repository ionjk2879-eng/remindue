import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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

// 한자(CJK 통합 한자)·일본어 가나 범위 — llama-3.3-70b가 가끔 한국어 문장 중간에 이 두 스크립트를
// 섞어 쓰는 현상이 관측돼서(모델 자체의 언어 드리프트, 입력 데이터엔 애초에 외국어가 없다) 감지용으로 둔다.
const FOREIGN_SCRIPT_PATTERN = /[一-鿿぀-ヿ]/;

/** 한자/가나가 섞인 문장을 순수 한국어로 다시 쓰게 하는 교정 재요청. 실패하면 원문을 그대로 둔다
 *  (틀린 걸 그대로 보여주는 게, 교정 실패로 아예 안 보여주는 것보다 낫다). */
async function translateToKorean(env: Env, text: string): Promise<string> {
  try {
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content:
            '입력 문장에 한자나 일본어 등 외국어가 섞여 있다. 의미는 그대로 유지하면서 전부 자연스러운 ' +
            '한국어(한글)로 다시 써라. 순수 문장만 반환하고, 따옴표·설명·태그는 붙이지 마라.',
        },
        { role: 'user', content: text },
      ],
    });
    const cleaned =
      typeof result === 'object' && result !== null && 'response' in result
        ? String((result as { response: unknown }).response).trim()
        : '';
    return cleaned || text;
  } catch {
    return text;
  }
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

    const result = await c.env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content: `당신은 가계부 소비 패턴 분석 AI입니다.
아래 소비 데이터를 분석하여 정확히 이 형식으로만 답하세요 (마크다운, 추가 설명, 라벨 번역 없이):

좋은소식: (긍정적인 관찰 1~2문장, 한국어)
주의사항: (주의할 점 1~2문장, 한국어. 특별히 없으면 "없음")
인사이트: (핵심 제안 1문장, 한국어)

반드시 순수 한국어(한글)로만 써라. 한자, 일본어, 영어 등 어떤 외국어 문자·단어도 절대 섞지 마라 —
브랜드명이 필요하면 한국에서 통용되는 한글 표기를 써라(예: "Netflix"가 아니라 "넷플릭스").`,
        },
        { role: 'user', content: dataLines },
      ],
    });

    const raw =
      typeof result === 'object' && result !== null && 'response' in result
        ? String((result as { response: unknown }).response).trim()
        : '';

    let goodNews = parseTag(raw, '좋은소식');
    let attention = parseTag(raw, '주의사항');
    let insight = parseTag(raw, '인사이트');

    // 프롬프트로 막아도 llama-3.3-70b가 가끔 한자/일본어를 섞어 쓰는 경우가 있어서, 감지되면
    // 그 필드만 한국어로 다시 쓰게 하는 교정 재요청을 한 번 더 보낸다.
    const toFix: Array<{ key: 'goodNews' | 'attention' | 'insight'; text: string }> = [];
    if (goodNews && FOREIGN_SCRIPT_PATTERN.test(goodNews)) toFix.push({ key: 'goodNews', text: goodNews });
    if (attention && FOREIGN_SCRIPT_PATTERN.test(attention)) toFix.push({ key: 'attention', text: attention });
    if (insight && FOREIGN_SCRIPT_PATTERN.test(insight)) toFix.push({ key: 'insight', text: insight });

    if (toFix.length > 0) {
      console.warn('[ai-summary] 한자/외국어 감지 —', toFix.map((f) => f.key).join(', '), '교정 재요청');
      const fixed = await Promise.all(toFix.map((f) => translateToKorean(c.env, f.text)));
      toFix.forEach((f, i) => {
        if (f.key === 'goodNews') goodNews = fixed[i];
        else if (f.key === 'attention') attention = fixed[i];
        else insight = fixed[i];
      });
    }

    console.log('[ai-summary] ok — good:', !!goodNews, 'attention:', !!attention, 'insight:', !!insight);
    return c.json({ goodNews, attention, insight });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-summary] unexpected error:', msg);
    return c.json({ goodNews: null, attention: null, insight: null, error: msg }, 500);
  }
});

export default aiSummary;

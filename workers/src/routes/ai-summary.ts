import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError, PaymentRequiredError } from '../lib/errors';
import type { Env, UserRow } from '../types';

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
  topCategoryShare: number | null;
  reviewCount: number;
  totalItems: number;
  nextPaymentDate: string | null;
  nextPaymentItem: string | null;
  nextPaymentDDay: number | null;
  priceChangeItems: string[];
  /** 현재 월 단위로 결제 중인 구독 서비스 목록 — 연간 플랜 절약 제안 계산용. */
  subscriptionItems: Array<{ name: string; monthlyAmount: number | null }>;
}

function validateSpendingSummaryInput(value: unknown): SpendingSummaryInput {
  if (!value || typeof value !== 'object') throw new BadRequestError('분석할 소비 정보를 확인할 수 없습니다.');
  const input = value as Record<string, unknown>;
  const isAmount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000_000_000;
  const isCount = (v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 10_000;
  const isNullableNumber = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
  const isNullableString = (v: unknown, maxLength: number) => v === null || (typeof v === 'string' && v.length <= maxLength);

  if (!Number.isInteger(input.month) || Number(input.month) < 1 || Number(input.month) > 12) {
    throw new BadRequestError('분석 월이 올바르지 않습니다.');
  }
  if (!isCount(input.recurringDeliveryCount) || !isCount(input.subscriptionCount) || !isCount(input.reviewCount) || !isCount(input.totalItems)) {
    throw new BadRequestError('항목 수가 올바르지 않습니다.');
  }
  if (!isAmount(input.monthlySpend) || !isAmount(input.yearlySpend) || !isNullableNumber(input.monthTrendPercent) || !isNullableNumber(input.topCategoryAmount) || !isNullableNumber(input.topCategoryShare)) {
    throw new BadRequestError('지출 금액이 올바르지 않습니다.');
  }
  if (!isNullableString(input.topCategory, 50) || !isNullableString(input.nextPaymentDate, 10) || !isNullableString(input.nextPaymentItem, 120)) {
    throw new BadRequestError('분석 항목이 올바르지 않습니다.');
  }
  if (input.nextPaymentDDay !== null && (!Number.isInteger(input.nextPaymentDDay) || Number(input.nextPaymentDDay) < -365 || Number(input.nextPaymentDDay) > 365)) {
    throw new BadRequestError('다음 결제 D-day가 올바르지 않습니다.');
  }
  if (!Array.isArray(input.priceChangeItems) || input.priceChangeItems.length > 20 || input.priceChangeItems.some((item) => typeof item !== 'string' || item.length > 120)) {
    throw new BadRequestError('가격 변동 항목이 올바르지 않습니다.');
  }
  if (
    !Array.isArray(input.subscriptionItems) ||
    input.subscriptionItems.length > 20 ||
    input.subscriptionItems.some(
      (item) =>
        typeof item !== 'object' || item === null ||
        typeof (item as Record<string, unknown>).name !== 'string' || ((item as Record<string, unknown>).name as string).length > 120 ||
        ((item as Record<string, unknown>).monthlyAmount !== null &&
          (typeof (item as Record<string, unknown>).monthlyAmount !== 'number' ||
           !Number.isFinite((item as Record<string, unknown>).monthlyAmount as number) ||
           ((item as Record<string, unknown>).monthlyAmount as number) < 0))
    )
  ) {
    throw new BadRequestError('구독 서비스 목록이 올바르지 않습니다.');
  }
  return input as unknown as SpendingSummaryInput;
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

/** AI 소비 매니저는 프리미엄 전용 — 프론트는 무료 플랜에서 이 탭 자체를 잠가서 호출하지 않지만,
 *  직접 호출을 막기 위해 라우트에서도 확인한다. */
aiSummary.post('/spending-summary', async (c) => {
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(c.get('userEmail')).first<UserRow>();
  if (!user || user.is_premium !== 1) {
    throw new PaymentRequiredError('AI 소비 매니저는 프리미엄 전용 기능이에요.');
  }

  const body = validateSpendingSummaryInput(await c.req.json<unknown>().catch(() => null));
  const rateLimit = await c.env.DB.prepare(
    `INSERT INTO ai_summary_requests (user_id, last_requested_at)
     VALUES (?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET last_requested_at = datetime('now')
     WHERE ai_summary_requests.last_requested_at <= datetime('now', '-10 seconds')`
  )
    .bind(user.id)
    .run();
  if (rateLimit.meta.changes === 0) {
    return c.json({ message: 'AI 분석은 잠시 후 다시 요청할 수 있어요.' }, 429);
  }

  try {
    const {
      month,
      recurringDeliveryCount,
      subscriptionCount,
      monthlySpend,
      yearlySpend,
      monthTrendPercent,
      topCategory,
      topCategoryAmount,
      topCategoryShare,
      reviewCount,
      nextPaymentDate,
      nextPaymentItem,
      nextPaymentDDay,
      priceChangeItems,
      subscriptionItems,
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
        ? `- 이번 달 최다 지출 카테고리: ${topCategory} (${fmt(topCategoryAmount)}원, 전체의 ${topCategoryShare ?? '?'}%)`
        : null,
      reviewCount > 0 ? `- 유지 안 함 표시했거나 3회차 이상 확인 안 된 구독/배송: ${reviewCount}건` : null,
      nextPaymentItem && nextPaymentDate && nextPaymentDDay !== null
        ? `- 다음 결제/배송 예정: ${nextPaymentItem} (${nextPaymentDDay <= 0 ? '오늘' : nextPaymentDDay === 1 ? '내일' : `${nextPaymentDDay}일 후`})`
        : '- 다음 결제/배송 예정: 없음',
      priceChangeItems.length > 0
        ? `- 최근 가격 변동 감지된 서비스: ${priceChangeItems.join(', ')}`
        : '- 최근 가격 변동 감지된 서비스: 없음',
      subscriptionItems.length > 0
        ? `- 연간 플랜 절약 검토 대상(현재 월 구독 중): ${subscriptionItems.map((item) =>
            item.monthlyAmount !== null ? `${item.name} (월 ${fmt(item.monthlyAmount)}원)` : item.name
          ).join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await c.env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content: `당신은 가계부 소비 패턴 분석 AI입니다.
아래 소비 데이터(지출 규모·추이, 정기배송/구독 건수, 최다 지출 카테고리, 미확인 구독,
다음 결제 예정, 가격 인상 여부)를 전부 종합적으로 검토해서 이 사람의 소비 패턴을 판단하고,
정확히 이 형식으로만 답하세요 (마크다운, 추가 설명, 라벨 번역 없이):

좋은소식: (긍정적인 관찰 1문장, 한국어)
주의사항: (주목할 만한 점 1문장, 한국어)
인사이트: (아래 항목들을 종합했을 때의 핵심 제안 1문장, 한국어)
절약제안: (아래 규칙을 엄격히 따라라: ①연간 구독료와 월 구독료를 정확히 알고 있어서 절약액을 원 단위로 계산할 수 있는 서비스만 언급한다 ②"직접 확인하라", "참고로", "정확하지 않을 수 있다" 같은 표현이 필요하다면 그 서비스는 모른다는 뜻이므로 아예 빼라 ③조건을 충족하는 서비스가 없으면 반드시 "없음"이라고만 써라 ④조건을 충족하면 서비스명과 구체적인 절약액을 명시해 1~2문장으로 써라. 한국어)

- 각 문장은 "구체적인 사실 하나 + 그에 대한 따뜻한 반응이나 챙겨주는 말 하나"를 같이 담아라.
  사실만 던지고 끝내지 마라 — 그러면 은행 알림 문자나 고지서처럼 차갑게 느껴진다.
  분량은 25~50자 정도, 사실+챙김 두 가지가 다 들어갈 만큼은 써라.
  나쁜 예1(장황·추상적): "최근 지출 감소 추세와 정기 구독 서비스를 관리함으로써 지출을 효율적으로
  관리할 수 있는 기회를 확대할 수 있습니다." (숫자도 없고 빙빙 돈다)
  나쁜 예2(사실만 던짐·차갑다): "지난달보다 12% 줄었어요." (통보만 하고 끝 — 고지서 같다)
  좋은 예: "지난달보다 12% 줄었어요, 알뜰하게 잘 관리하고 계세요!" / "다음 결제까지 N일 남았어요,
  깜빡하지 않게 챙겨드릴게요." (N은 데이터에서 가져온 실제 숫자 — 임의로 바꾸지 마라)
- 특히 인사이트는 AI가 사용자 대신 챙겨주는 듯한 능동적인 말투로 끝맺어라(예: "~해보세요",
  "~확인했어요", "~해드릴게요"). 관찰자처럼 사실만 통보하지 말고, 옆에서 챙겨주는 느낌으로.
- 주의사항은 "없음"으로 비우지 마라 — 정말 특별한 우려가 없더라도, 관리 관점에서 참고할 만한
  점(예: 정기적인 점검 권유, 다음 결제 대비 등)을 하나는 반드시 짚어라.
- 관찰(observation)에 그치지 말고 판단(judgment)을 내려라 — 숫자를 그대로 되읊지 말고 그게
  무슨 의미인지 해석해라.
  예: "구독 수 2개" → "관리 부담이 크지 않은 편입니다."
  예: "최다 카테고리 비중 15%" → "특정 카테고리에 쏠리지 않고 비교적 균형적입니다." (비중이
  대략 50% 넘으면 "쏠려 있다", 30% 미만이면 "균형적이다"로 판단해라. 그 사이는 자유롭게 판단.)
  예: "정기구독/배송 10개 이상" → "관리할 항목이 많은 편이니 점검이 필요합니다."
- 단, 데이터에 없는 원인은 지어내지 마라. 예를 들어 지출이 줄었다고 해서 "일회성 구매가
  줄어서"처럼 이 데이터에 없는 이유를 단정하지 마라 — 이유를 모르면 그냥 결과와 그에 대한
  판단만 말해라("정기 지출이 줄었어요, 좋은 흐름이에요" 정도).
- 날짜와 서비스명을 언급할 때는 반드시 주어진 데이터에 있는 그대로만 인용해라 — 지어내거나
  다른 날짜/이름으로 바꾸지 마라.
- 반드시 순수 한국어(한글)로만 써라. 한자, 일본어, 영어 등 어떤 외국어 문자·단어도 절대 섞지 마라 —
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
    let annualSavingsSuggestion = parseTag(raw, '절약제안');

    // 프롬프트로 막아도 llama-3.3-70b가 가끔 한자/일본어를 섞어 쓰는 경우가 있어서, 감지되면
    // 그 필드만 한국어로 다시 쓰게 하는 교정 재요청을 한 번 더 보낸다.
    const toFix: Array<{ key: 'goodNews' | 'attention' | 'insight' | 'annualSavingsSuggestion'; text: string }> = [];
    if (goodNews && FOREIGN_SCRIPT_PATTERN.test(goodNews)) toFix.push({ key: 'goodNews', text: goodNews });
    if (attention && FOREIGN_SCRIPT_PATTERN.test(attention)) toFix.push({ key: 'attention', text: attention });
    if (insight && FOREIGN_SCRIPT_PATTERN.test(insight)) toFix.push({ key: 'insight', text: insight });
    if (annualSavingsSuggestion && FOREIGN_SCRIPT_PATTERN.test(annualSavingsSuggestion)) toFix.push({ key: 'annualSavingsSuggestion', text: annualSavingsSuggestion });

    if (toFix.length > 0) {
      console.warn('[ai-summary] 한자/외국어 감지 —', toFix.map((f) => f.key).join(', '), '교정 재요청');
      const fixed = await Promise.all(toFix.map((f) => translateToKorean(c.env, f.text)));
      toFix.forEach((f, i) => {
        if (f.key === 'goodNews') goodNews = fixed[i];
        else if (f.key === 'attention') attention = fixed[i];
        else if (f.key === 'insight') insight = fixed[i];
        else annualSavingsSuggestion = fixed[i];
      });
    }

    console.log('[ai-summary] ok — good:', !!goodNews, 'attention:', !!attention, 'insight:', !!insight, 'annualSavings:', !!annualSavingsSuggestion);
    return c.json({ goodNews, attention, insight, annualSavingsSuggestion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-summary] unexpected error:', msg);
    return c.json({ goodNews: null, attention: null, insight: null, error: msg }, 500);
  }
});

export default aiSummary;

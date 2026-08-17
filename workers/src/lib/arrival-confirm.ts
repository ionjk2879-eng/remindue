// "오늘 주문하신 물건이 오셨나요?" — GENERAL 전용 도착 확인 알림. confirmation-nudge.ts의
// "당일 유지 확인"과는 목적이 다르다 — 그쪽은 "계속 쓰는지" 관리용이고, 이건 실제 도착일을
// 물어서 도착 앵커(purchases.expected_delivery_date)를 실측치로 갱신하는 용도다.
//
// RECURRING_DELIVERY는 대상이 아니다 — 택배사가 당일 문자로 도착 여부를 알려주는데 이 앱이
// 따로 "받았냐"고 물어볼 필요는 없다는 판단으로 뺐다. 다만 RECURRING_DELIVERY도 여전히
// arrivalAnchor(expected_delivery_date)를 스케줄 앵커로 쓴다 — purchase-logic.ts의
// computeDeadlines가 그 앵커에서 결제일을 역산하는 계산은 실측 데이터로 검증된 로직이라
// 그대로 둔다. 이 파일이 담당하는 "사용자에게 실제 도착일을 물어서 앵커를 실측치로
// 재조정하는" 확인 절차만 GENERAL로 좁힌 것 — RECURRING_DELIVERY의 앵커는 등록/수정 폼에서
// 직접 입력한 값을 그대로 신뢰하고, 카드에는 그 값 대신 결제일 기준의 참고용 도착 예상
// 범위(estimateArrivalRange)만 보여준다(mapper.ts).
//
// 발송 조건(매일 크론에서 매번 체크):
//   1) 오늘이 도착(예정)일이고 아직 스누즈 이력이 없을 때, 또는
//   2) "아직요"로 미뤄서(arrival_check_snoozed_until) 그 날짜가 오늘이거나 지났을 때(재발송)
// GENERAL은 "기한"(반품/AS 만료일)과 "도착일"이 전혀 다른 날짜라 반드시 앵커(arrivalAnchor)를
// 직접 봐야 한다. push_action_tokens(action-tokens.ts)를 재사용한다 — "받았어요"는 오늘/하루전/
// 이틀전 중 하나를 더 골라야 해서 액션 버튼 하나로 끝낼 수 없으니, 토큰을 담아 대시보드를 열어
// 그 후속 질문을 모달로 띄운다(routes/push.ts의 confirm-arrival). "아직요"는 그 자리에서 스누즈만
// 하면 끝나는 단순 액션이라 앱을 열지 않는다(sw.ts).

import { arrivalAnchor } from './purchase-logic';
import { addDays, todayDateOnly } from './date';
import { sendPush } from './push';
import { makeFcmSender } from './fcm';
import { createActionBatchToken } from './action-tokens';
import type { Env, NativePushTokenRow, PurchaseRow, PushSubscriptionRow } from '../types';

export interface ArrivalConfirmRunResult {
  itemsAsked: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

/**
 * KST 날짜가 바뀐 뒤 전날 도착 확인에 응답하지 않은 항목을 "아직요"와 같은 상태로 넘긴다.
 *
 * 응답이 없었다고 실제 미도착을 단정해 배송일을 바꾸지는 않는다. 다만 다음 날에도 놓치지
 * 않도록 snoozed_until을 오늘으로 설정해, 15시 도착 확인 알림과 대시보드에 다시 나타나게 한다.
 */
export async function rollOverUnansweredArrivals(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM purchases
       WHERE type = 'GENERAL'
         AND archived_at IS NULL
         AND discarded_at IS NULL
         AND discontinued_at IS NULL
         AND arrival_check_snoozed_until IS NULL`
  ).all<PurchaseRow>();

  const today = todayDateOnly();
  const yesterday = addDays(today, -1);
  const ids = results.filter((row) => row.last_delivered_date === null && arrivalAnchor(row) === yesterday).map((row) => row.id);

  if (ids.length === 0) return 0;
  await env.DB.prepare(
    `UPDATE purchases
        SET arrival_check_snoozed_until = ?, updated_at = datetime('now')
      WHERE id IN (${ids.map(() => '?').join(',')})`
  )
    .bind(today, ...ids)
    .run();
  return ids.length;
}

export async function runArrivalConfirm(env: Env): Promise<ArrivalConfirmRunResult> {
  const fcmSend = makeFcmSender(env.FIREBASE_SERVICE_ACCOUNT);
  const { results } = await env.DB.prepare(
    `SELECT * FROM purchases
       WHERE type = 'GENERAL'
         AND archived_at IS NULL
         AND discarded_at IS NULL
         AND discontinued_at IS NULL`
  ).all<PurchaseRow>();

  const today = todayDateOnly();
  let itemsAsked = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  const dueByUser = new Map<number, PurchaseRow[]>();
  for (const row of results) {
    const arrivalDate = arrivalAnchor(row);

    // last_delivered_date가 이미 이번 도착일(arrivalDate)과 같으면, 알림이 뜨기 전에 대시보드에서
    // 먼저 "받았어요"(confirm-arrival)로 답한 것이다. 이 경우 또 물어보지 않는다.
    const alreadyAnswered = row.last_delivered_date === arrivalDate;
    const isFirstAsk = arrivalDate === today && row.arrival_check_snoozed_until === null && !alreadyAnswered;
    const isSnoozedRetry = row.arrival_check_snoozed_until !== null && row.arrival_check_snoozed_until <= today && !alreadyAnswered;
    if (!isFirstAsk && !isSnoozedRetry) continue;

    const items = dueByUser.get(row.user_id) ?? [];
    items.push(row);
    dueByUser.set(row.user_id, items);
  }

  for (const [userId, items] of dueByUser) {
    itemsAsked += items.length;
    const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .bind(userId)
      .all<PushSubscriptionRow>();
    const { results: nativeTokens } = await env.DB.prepare('SELECT * FROM native_push_tokens WHERE user_id = ?')
      .bind(userId)
      .all<NativePushTokenRow>();
    if (subs.length === 0 && nativeTokens.length === 0) continue;

    const actionToken = await createActionBatchToken(env.DB, userId, 'ARRIVAL', items.map((item) => item.id));
    const dashboardUrl = `${env.APP_URL}/dashboard?confirmArrivalBatch=${actionToken}&confirmArrivalItems=${items.map((item) => item.id).join(',')}`;
    const itemSummary = items.slice(0, 2).map((item) => item.item_name).join(', ');
    const more = items.length > 2 ? ` 외 ${items.length - 2}건` : '';
    // 항목이 하나뿐이면 "모두 받음"/"일부 받음"의 구분이 의미가 없다(어차피 하나만 고를 수 있어서
    // 늘 같은 동작) — "받았어요"(날짜 선택 모달) / "아직 안 옴" 2버튼으로 단순화한다.
    // "받았어요"는 여러 건일 때의 "일부 받음"과 같은 arrival_partial 액션을 그대로 재사용한다 —
    // 어차피 그 모달이 항목 하나짜리 체크박스+날짜 선택으로도 그대로 동작한다.
    const actions = items.length === 1
      ? [
          { action: 'arrival_partial', title: '받았어요' },
          { action: 'arrival_not_yet', title: '아직 안 옴' },
        ]
      : [
          { action: 'arrival_all_received', title: '모두 받음' },
          { action: 'arrival_partial', title: '일부 받음' },
          { action: 'arrival_not_yet', title: '아직 미도착' },
        ];
    const pushPayload = {
      title: `📦 오늘 배송 확인 ${items.length}건`,
      body: `${itemSummary}${more} — 수령한 배송만 처리해 주세요. 미도착 항목은 내일 다시 알려드려요.`,
      url: dashboardUrl,
      notificationKind: 'ARRIVAL' as const,
      actions,
      actionToken,
    };

    for (const sub of subs) {
      const { sent, gone } = await sendPush(env, sub, pushPayload);
      if (sent) pushSent += 1;
      if (gone) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        pushSubscriptionsPruned += 1;
      }
    }

    if (fcmSend) {
      for (const row of nativeTokens) {
        const { sent, gone } = await fcmSend(row.token, pushPayload);
        if (sent) pushSent += 1;
        if (gone) await env.DB.prepare('DELETE FROM native_push_tokens WHERE id = ?').bind(row.id).run();
      }
    }
  }

  return { itemsAsked, pushSent, pushSubscriptionsPruned };
}

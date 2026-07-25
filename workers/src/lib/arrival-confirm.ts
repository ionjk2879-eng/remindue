// "오늘 주문하신 물건이 오셨나요?" — GENERAL/RECURRING_DELIVERY 전용(usesArrivalDate) 도착 확인
// 알림. confirmation-nudge.ts의 "당일 유지 확인"과는 목적이 다르다 — 그쪽은 "계속 쓰는지"
// 관리용이고, 이건 실제 도착일을 물어서 도착 앵커(purchases.expected_delivery_date)를 실측치로
// 갱신하는 용도다. SUBSCRIPTION은 대상이 아니다(실물 배송이 없어 "도착"이라는 개념 자체가 없다).
//
// RECURRING_DELIVERY는 이 앵커가 배송 사이클의 위상 기준점이라 확정되면 다음 회차가 재정렬되고
// (delivery_confirm_count도 함께 증가), GENERAL은 반복 사이클이 없어 반품기한(7일)·A/S 보증(1년)
// 기산일이 그 날짜로 확정될 뿐이다(routes/push.ts의 confirm-arrival이 타입별로 분기).
//
// 발송 조건(매일 크론에서 매번 체크):
//   1) 오늘이 도착 앵커(arrivalAnchor) 날짜이고 아직 스누즈 이력이 없을 때, 또는
//   2) "아직요"로 미뤄서(arrival_check_snoozed_until) 그 날짜가 오늘이거나 지났을 때(재발송)
// RECURRING_DELIVERY는 computeDeadline()의 dDay(=배송 사이클 기한)가 아니라 arrivalAnchor 자체를
// 직접 비교한다 — 앵커=기한인 첫 회차(cyclesElapsed=0)에서는 같은 값이지만, GENERAL은 애초에
// "기한"(반품/AS 만료일)과 "도착일"이 전혀 다른 날짜라 반드시 앵커를 직접 봐야 한다.
// 둘 다 push_action_tokens(action-tokens.ts)를 재사용한다 — "받았어요"는 오늘/하루전/이틀전 중
// 하나를 더 골라야 해서 액션 버튼 하나로 끝낼 수 없으니, 토큰을 담아 대시보드를 열어 그 후속
// 질문을 모달로 띄운다(routes/push.ts의 confirm-arrival). "아직요"는 그 자리에서 스누즈만 하면
// 끝나는 단순 액션이라 앱을 열지 않는다(sw.ts).

import { arrivalAnchor } from './purchase-logic';
import { todayDateOnly } from './date';
import { sendPush } from './push';
import { createActionToken } from './action-tokens';
import type { Env, PurchaseRow, PushSubscriptionRow } from '../types';

export interface ArrivalConfirmRunResult {
  itemsAsked: number;
  pushSent: number;
  pushSubscriptionsPruned: number;
}

export async function runArrivalConfirm(env: Env): Promise<ArrivalConfirmRunResult> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM purchases
       WHERE type IN ('RECURRING_DELIVERY', 'GENERAL')
         AND archived_at IS NULL
         AND discarded_at IS NULL
         AND discontinued_at IS NULL`
  ).all<PurchaseRow>();

  const today = todayDateOnly();
  let itemsAsked = 0;
  let pushSent = 0;
  let pushSubscriptionsPruned = 0;

  for (const row of results) {
    const anchor = arrivalAnchor(row);

    const isFirstAsk = anchor === today && row.arrival_check_snoozed_until === null;
    const isSnoozedRetry = row.arrival_check_snoozed_until !== null && row.arrival_check_snoozed_until <= today;
    if (!isFirstAsk && !isSnoozedRetry) continue;

    itemsAsked += 1;
    const { results: subs } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .bind(row.user_id)
      .all<PushSubscriptionRow>();
    if (subs.length === 0) continue;

    const actionToken = await createActionToken(env.DB, row.id);
    const dashboardUrl = `${env.APP_URL}/dashboard?confirmArrival=${actionToken}`;

    for (const sub of subs) {
      const { sent, gone } = await sendPush(env, sub, {
        title: `📦 ${row.item_name}, 오늘 오셨나요?`,
        body: '받으셨으면 "받았어요"를 눌러 확인해 주세요.',
        url: dashboardUrl,
        actions: [
          { action: 'arrival_received', title: '받았어요' },
          { action: 'arrival_not_yet', title: '아직요' },
        ],
        actionToken,
      });
      if (sent) pushSent += 1;
      if (gone) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
        pushSubscriptionsPruned += 1;
      }
    }
  }

  return { itemsAsked, pushSent, pushSubscriptionsPruned };
}

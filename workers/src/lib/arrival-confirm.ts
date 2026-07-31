// "오늘 주문하신 물건이 오셨나요?" — GENERAL/RECURRING_DELIVERY 전용(usesArrivalDate) 도착 확인
// 알림. confirmation-nudge.ts의 "당일 유지 확인"과는 목적이 다르다 — 그쪽은 "계속 쓰는지"
// 관리용이고, 이건 실제 도착일을 물어서 도착 앵커(purchases.expected_delivery_date)를 실측치로
// 갱신하는 용도다. SUBSCRIPTION은 대상이 아니다(실물 배송이 없어 "도착"이라는 개념 자체가 없다).
//
// RECURRING_DELIVERY 중 결제일과 도착예정일이 같은(arrival_offset_days가 null인) 항목은 이 앵커가
// 배송 사이클의 위상 기준점이라 확정되면 다음 회차가 재정렬된다. arrival_offset_days가 설정돼
// 있어 결제일과 도착예정일이 분리된 항목은 확정해도 이 앵커(=결제 사이클 기준점)를 건드리지 않고
// 수령 이력만 남긴다(recordArrival 참고) — 아니면 확인할 때마다 결제일이 오프셋만큼씩 뒤로
// 밀리는 누적 드리프트가 생긴다. 딱 2회차 확인 시점만 예외로 앵커를 그 확인일로 한 번 재보정한다
// (1회차 앵커가 애초에 부정확했을 가능성을 보정할 유일한 기회 — 3회차부터는 다시 얼린다).
// GENERAL은 반복 사이클이 없어 반품기한(7일)·A/S 보증(1년) 기산일이 그 날짜로 확정될 뿐이다.
//
// 발송 조건(매일 크론에서 매번 체크):
//   1) 오늘이 도착(예정)일이고 아직 스누즈 이력이 없을 때, 또는
//   2) "아직요"로 미뤄서(arrival_check_snoozed_until) 그 날짜가 오늘이거나 지났을 때(재발송)
// RECURRING_DELIVERY(반복)는 결제일(computeDeadline().deadline)이 아니라 거기에 영업일
// 오프셋(arrival_offset_days)을 더한 도착예정일(computeArrivalEstimate)로 비교한다 — 오프셋이
// 없으면 결제일과 동일해 기존 동작 그대로다. GENERAL은 애초에 "기한"(반품/AS 만료일)과
// "도착일"이 전혀 다른 날짜라 반드시 앵커(arrivalAnchor)를 직접 봐야 한다.
// 둘 다 push_action_tokens(action-tokens.ts)를 재사용한다 — "받았어요"는 오늘/하루전/이틀전 중
// 하나를 더 골라야 해서 액션 버튼 하나로 끝낼 수 없으니, 토큰을 담아 대시보드를 열어 그 후속
// 질문을 모달로 띄운다(routes/push.ts의 confirm-arrival). "아직요"는 그 자리에서 스누즈만 하면
// 끝나는 단순 액션이라 앱을 열지 않는다(sw.ts).

import { arrivalAnchor, computeArrivalEstimate, computeDeadline, computePreviousScheduleDeadline } from './purchase-logic';
import { addDays, todayDateOnly } from './date';
import { sendPush } from './push';
import { createActionBatchToken } from './action-tokens';
import type { Env, PurchaseRow, PushSubscriptionRow } from '../types';

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
       WHERE type IN ('RECURRING_DELIVERY', 'GENERAL')
         AND archived_at IS NULL
         AND discarded_at IS NULL
         AND discontinued_at IS NULL
         AND arrival_check_snoozed_until IS NULL`
  ).all<PurchaseRow>();

  const today = todayDateOnly();
  const yesterday = addDays(today, -1);
  const ids: number[] = [];

  for (const row of results) {
    let wasDueYesterday = false;
    if (row.type === 'GENERAL') {
      wasDueYesterday = row.last_delivered_date === null && arrivalAnchor(row) === yesterday;
    } else if (row.is_one_time === 1) {
      wasDueYesterday = row.last_delivered_date === null && arrivalAnchor(row) === yesterday;
    } else {
      // 정기배송은 computeDeadline이 항상 오늘 이후 회차를 돌려주므로, 직전 회차를 비교해야 한다.
      // 결제일이 아니라(위 발송 조건 설명 참고) 그 결제일 기준 도착예정일과 비교한다.
      const previousDeadline = computePreviousScheduleDeadline(row);
      wasDueYesterday =
        previousDeadline !== null && (computeArrivalEstimate(previousDeadline, row.arrival_offset_days) ?? previousDeadline) === yesterday;
    }
    if (wasDueYesterday) ids.push(row.id);
  }

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

  const dueByUser = new Map<number, PurchaseRow[]>();
  for (const row of results) {
    // 일반 구매는 입력된 도착 예정일을 한 번만 확인하고, 정기배송은 매 회차의 다음 배송일을
    // 확인한다. 기존에는 정기배송도 최초 앵커 날짜만 봐서 두 번째 회차부터는 질문이 누락됐다.
    // 한 번만 쓰는 정기배송은 최초 도착일만 묻고, 실제 수령일이 기록된 뒤에는 이후 회차를
    // 만들지 않는다. 목록 보관과 "유지 안 함"은 별개라 row 자체는 그대로 남긴다.
    if (row.type === 'RECURRING_DELIVERY' && row.is_one_time === 1 && row.last_delivered_date !== null) continue;
    const arrivalDate =
      row.type === 'RECURRING_DELIVERY' && row.is_one_time === 0
        ? computeArrivalEstimate(computeDeadline(row).deadline, row.arrival_offset_days) ?? computeDeadline(row).deadline
        : arrivalAnchor(row);

    // last_delivered_date가 이미 이번 회차(arrivalDate)와 같으면, 알림이 뜨기 전에 대시보드에서
    // 먼저 "받았어요"(confirm-arrival) 또는 "이번 회차 수령 확인"(mark-delivered)으로 답한
    // 것이다 — 둘 다 last_delivered_date를 그 회차 날짜로 채운다. 이 경우 또 물어보지 않는다.
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
    if (subs.length === 0) continue;

    const actionToken = await createActionBatchToken(env.DB, userId, 'ARRIVAL', items.map((item) => item.id));
    const dashboardUrl = `${env.APP_URL}/dashboard?confirmArrivalBatch=${actionToken}&confirmArrivalItems=${items.map((item) => item.id).join(',')}`;
    const itemSummary = items.slice(0, 2).map((item) => `${item.item_name} · ${item.type === 'RECURRING_DELIVERY' ? '정기배송' : '일반배송'}`).join(', ');
    const more = items.length > 2 ? ` 외 ${items.length - 2}건` : '';

    for (const sub of subs) {
      const { sent, gone } = await sendPush(env, sub, {
        title: `📦 오늘 배송 확인 ${items.length}건`,
        body: `${itemSummary}${more} — 수령한 배송만 처리해 주세요. 미도착 항목은 내일 다시 알려드려요.`,
        url: dashboardUrl,
        notificationKind: 'ARRIVAL',
        actions: [
          { action: 'arrival_all_received', title: '모두 받음' },
          { action: 'arrival_partial', title: '일부 받음' },
          { action: 'arrival_not_yet', title: '아직 미도착' },
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

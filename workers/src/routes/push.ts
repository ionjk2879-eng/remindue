import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError } from '../lib/errors';
import { consumeActionBatchToken, consumeActionToken } from '../lib/action-tokens';
import { addDays, todayDateOnly } from '../lib/date';
import { confirmReceiptToday, isValidArrivalDaysAgo, resolveArrivalDate, InvalidPurchaseOperationError } from '../lib/purchase-logic';
import { refreshRecurringFxOnConfirmation } from '../lib/recurring-fx';
import { sendPush } from '../lib/push';
import { computeDDay, computeDeadline } from '../lib/purchase-logic';
import type { Env, PurchaseRow, PushSubscriptionRequestBody, UserRow } from '../types';
import type { PushSubscriptionRow } from '../types';

const push = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

function validateSubscriptionBody(body: Partial<PushSubscriptionRequestBody>): PushSubscriptionRequestBody {
  if (!body.endpoint || typeof body.endpoint !== 'string') {
    throw new BadRequestError('endpoint는 필수입니다');
  }
  if (!body.keys?.p256dh || !body.keys?.auth) {
    throw new BadRequestError('keys.p256dh, keys.auth는 필수입니다');
  }
  return { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } };
}

async function recordArrival(db: D1Database, purchase: PurchaseRow, daysAgo: 0 | 1 | 2): Promise<void> {
  if (purchase.type === 'SUBSCRIPTION') throw new BadRequestError('정기구독 항목은 도착 확인 대상이 아닙니다');
  const arrivalDate = resolveArrivalDate(daysAgo);
  if (purchase.type === 'RECURRING_DELIVERY') {
    await db.prepare(
      `UPDATE purchases SET expected_delivery_date = ?, last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1,
       discontinued_at = NULL, arrival_check_snoozed_until = NULL, updated_at = datetime('now') WHERE id = ?`
    ).bind(arrivalDate, arrivalDate, purchase.id).run();
  } else {
    await db.prepare(
      `UPDATE purchases SET expected_delivery_date = ?, last_delivered_date = ?, arrival_check_snoozed_until = NULL,
       updated_at = datetime('now') WHERE id = ?`
    ).bind(arrivalDate, arrivalDate, purchase.id).run();
  }
}


/** 프론트에서 pushManager.subscribe()의 applicationServerKey로 쓸 VAPID 공개키. 로그인 여부와 무관하게 공개된 값. */
push.get('/vapid-public-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY }));

push.use('/subscribe', authMiddleware);
push.post('/subscribe', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = validateSubscriptionBody(await c.req.json<Partial<PushSubscriptionRequestBody>>().catch(() => ({})));

  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`
  )
    .bind(user.id, body.endpoint, body.keys.p256dh, body.keys.auth)
    .run();

  return c.body(null, 204);
});

/** 현재 로그인한 사용자에게만 발송하는 연결 확인용 알림. */
push.use('/test', authMiddleware);
push.post('/test', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const { results: subscriptions } = await c.env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
    .bind(user.id)
    .all<PushSubscriptionRow>();

  if (subscriptions.length === 0) {
    throw new BadRequestError('이 브라우저에 등록된 알림 구독이 없습니다. 먼저 알림을 허용해주세요.');
  }

  const { results: purchases } = await c.env.DB.prepare(
    `SELECT * FROM purchases
      WHERE user_id = ?
        AND type IN ('GENERAL', 'RECURRING_DELIVERY', 'SUBSCRIPTION')
        AND archived_at IS NULL
        AND discarded_at IS NULL
        AND discontinued_at IS NULL`
  ).bind(user.id).all<PurchaseRow>();

  const deliveries: Array<{ itemName: string; date: string }> = [];
  const payments: Array<{ itemName: string; date: string }> = [];
  for (const purchase of purchases) {
    if (purchase.type === 'GENERAL') {
      if (purchase.last_delivered_date || !purchase.expected_delivery_date) continue;
      const dDay = computeDDay(purchase.expected_delivery_date);
      if (dDay >= 0 && dDay <= 7) deliveries.push({ itemName: purchase.item_name, date: purchase.expected_delivery_date });
      continue;
    }
    const { deadline } = computeDeadline(purchase);
    const dDay = computeDDay(deadline);
    if (dDay < 0 || dDay > 7) continue;
    if (purchase.type === 'RECURRING_DELIVERY') {
      deliveries.push({ itemName: purchase.is_one_time === 1 ? `${purchase.item_name} (유지 안 함)` : purchase.item_name, date: deadline });
    }
    if (purchase.type === 'SUBSCRIPTION') {
      payments.push({ itemName: purchase.is_one_time === 1 ? `${purchase.item_name} (유지 안 함)` : purchase.item_name, date: deadline });
    }
  }
  const render = (label: string, items: Array<{ itemName: string; date: string }>) => [
    `${label} ${items.length}건`,
    ...items.slice(0, 3).map((item) => `• ${item.itemName} — ${item.date.slice(5)}`),
  ];
  const body = deliveries.length || payments.length
    ? [...(deliveries.length ? render('📦 이번 주 도착 예정', deliveries) : []), ...(payments.length ? ['', ...render('💳 이번 주 결제 예정', payments)] : [])].join('\n')
    : '오늘부터 7일 안에 예정된 도착·결제 항목이 없습니다.';

  let sent = 0;
  let pruned = 0;
  for (const subscription of subscriptions) {
    const result = await sendPush(c.env, subscription, {
      title: '🔔 Remindue 예정 항목 테스트',
      body,
      url: `${c.env.APP_URL}/dashboard`,
      actions: [{ action: 'open_dashboard', title: '대시보드 열기' }],
    });
    if (result.sent) sent += 1;
    if (result.gone) {
      await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
      pruned += 1;
    }
  }

  if (sent === 0) throw new BadRequestError('테스트 알림을 보내지 못했습니다. 알림 설정을 다시 확인해주세요.');
  return c.json({ sent, pruned });
});

/**
 * 인증을 요구하지 않는다 — endpoint 자체가 해당 구독을 아는 것만으로 소유를 증명하는
 * 값이라(추측 불가능한 URL), 로그인 세션이 없는 서비스 워커(pushsubscriptionchange 등,
 * 페이지의 accessToken에 접근 불가)에서도 곧바로 정리를 요청할 수 있어야 하기 때문.
 */
push.post('/unsubscribe', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>().catch(() => ({}) as { endpoint?: string });
  if (!body.endpoint) {
    throw new BadRequestError('endpoint는 필수입니다');
  }

  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(body.endpoint).run();

  return c.body(null, 204);
});

/**
 * 알림의 "유지하기" 액션 버튼 — 인증 없이 토큰만으로 처리한다(위 unsubscribe와 같은 이유: 알림을
 * 앱을 열지 않고 바로 눌렀을 때, 서비스워커엔 로그인 세션이 없다). 토큰은 confirmation-nudge.ts가
 * 당일(dDay=0) 결제 알림을 보낼 때 발급하고, 1회 사용하면 무효화된다(action-tokens.ts).
 * 효과는 routes/purchases.ts의 mark-delivered와 동일 — 회차 확인 + discontinued_at 해제.
 */
push.post('/confirm-action', async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  if (!body.token) {
    throw new BadRequestError('token은 필수입니다');
  }

  const purchaseId = await consumeActionToken(c.env.DB, body.token);
  if (purchaseId === null) {
    throw new BadRequestError('유효하지 않거나 이미 사용된 토큰입니다');
  }

  const purchase = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(purchaseId).first<PurchaseRow>();
  if (!purchase) throw new BadRequestError(`항목을 찾을 수 없습니다: ${purchaseId}`);

  let today: string;
  try {
    today = confirmReceiptToday(purchase.type);
  } catch (e) {
    if (e instanceof InvalidPurchaseOperationError) throw new BadRequestError(e.message);
    throw e;
  }

  await c.env.DB.prepare(
    `UPDATE purchases
        SET last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1,
            discontinued_at = NULL, updated_at = datetime('now')
      WHERE id = ?`
  )
    .bind(today, purchaseId)
    .run();
  await refreshRecurringFxOnConfirmation(c.env.DB, purchase);

  return c.body(null, 204);
});

/**
 * "오늘 주문하신 물건이 오셨나요?" 알림의 "아직요" — 인증 없이 토큰만으로 처리(위 confirm-action과
 * 같은 이유). 내일 다시 물어보도록 arrival_check_snoozed_until을 채운다. 스케줄 자체(도착 앵커)는
 * 건드리지 않는다 — 아직 도착 여부를 모르니 추정치를 그대로 둔다.
 */
push.post('/snooze-arrival', async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  if (!body.token) {
    throw new BadRequestError('token은 필수입니다');
  }

  const purchaseId = await consumeActionToken(c.env.DB, body.token);
  if (purchaseId === null) {
    throw new BadRequestError('유효하지 않거나 이미 사용된 토큰입니다');
  }

  const tomorrow = addDays(todayDateOnly(), 1);
  await c.env.DB.prepare(
    `UPDATE purchases SET arrival_check_snoozed_until = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(tomorrow, purchaseId)
    .run();

  return c.body(null, 204);
});

/**
 * "오늘 주문하신 물건이 오셨나요?" 알림의 "받았어요" 후속 — 며칠 전에 받았는지(0/1/2일 전) 답하면
 * 그 실제 도착일을 새 expected_delivery_date(도착 앵커)로 확정한다. 액션 버튼 하나로 끝낼 수
 * 없는 후속 질문이라(오늘/하루전/이틀전 3지선다), 알림 탭 시 대시보드가 열리고 거기서 이 토큰과
 * 함께 이 엔드포인트를 부른다 — 그래도 인증은 요구하지 않는다(토큰 소유 자체가 권한이라는 같은
 * 원칙, 알림을 탭한 직후엔 세션이 아직 안 살아있을 수도 있어서).
 *
 * RECURRING_DELIVERY는 이 앵커가 배송 사이클의 위상 기준점이라 이번 회차 확인(delivery_confirm_count
 * 증가·discontinued_at 해제)까지 같이 처리하지만, GENERAL은 반복 사이클이 없어(반품기한·A/S
 * 보증 기산일만 이 날짜로 확정되면 끝) 그 두 필드는 건드리지 않는다 — 정기배송·구독 전용 "유지
 * 확인" 개념을 1회성 구매에 억지로 끼워넣지 않기 위함(GENERAL은 discontinue 라우트 자체도 없다).
 */
push.post('/confirm-arrival', async (c) => {
  const body = await c.req.json<{ token?: string; daysAgo?: number }>().catch(() => ({}) as { token?: string; daysAgo?: number });
  if (!body.token) {
    throw new BadRequestError('token은 필수입니다');
  }
  if (!isValidArrivalDaysAgo(body.daysAgo)) {
    throw new BadRequestError('daysAgo는 0, 1, 2 중 하나여야 합니다');
  }

  const purchaseId = await consumeActionToken(c.env.DB, body.token);
  if (purchaseId === null) {
    throw new BadRequestError('유효하지 않거나 이미 사용된 토큰입니다');
  }

  const purchase = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ?').bind(purchaseId).first<PurchaseRow>();
  if (!purchase) throw new BadRequestError(`항목을 찾을 수 없습니다: ${purchaseId}`);
  if (purchase.type === 'SUBSCRIPTION') {
    throw new BadRequestError('정기구독 항목은 도착 확인 대상이 아닙니다');
  }

  const arrivalDate = resolveArrivalDate(body.daysAgo);
  if (purchase.type === 'RECURRING_DELIVERY') {
    await c.env.DB.prepare(
      `UPDATE purchases
          SET expected_delivery_date = ?, last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1,
              discontinued_at = NULL, arrival_check_snoozed_until = NULL, updated_at = datetime('now')
        WHERE id = ?`
    )
      .bind(arrivalDate, arrivalDate, purchaseId)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE purchases
          SET expected_delivery_date = ?, last_delivered_date = ?, arrival_check_snoozed_until = NULL, updated_at = datetime('now')
        WHERE id = ?`
    )
      .bind(arrivalDate, arrivalDate, purchaseId)
      .run();
  }

  return c.body(null, 204);
});

/** 같은 날짜에 묶인 배송 도착 확인: 전부 오늘 받음 / 일부 수령 / 전부 내일 재질문. */
push.post('/arrival-batch/:action', async (c) => {
  const action = c.req.param('action');
  const body = await c.req.json<{ token?: string; received?: { id: number; daysAgo: number }[] }>()
    .catch(() => ({} as { token?: string; received?: { id: number; daysAgo: number }[] }));
  if (!body.token) throw new BadRequestError('token은 필수입니다');
  if (action !== 'all-received' && action !== 'partial' && action !== 'snooze') throw new BadRequestError('유효하지 않은 처리입니다');

  const batch = await consumeActionBatchToken(c.env.DB, body.token);
  if (!batch || batch.kind !== 'ARRIVAL') throw new BadRequestError('유효하지 않거나 이미 처리된 알림이에요');
  const placeholders = batch.purchaseIds.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM purchases WHERE user_id = ? AND id IN (${placeholders}) AND type IN ('GENERAL', 'RECURRING_DELIVERY')`
  ).bind(batch.userId, ...batch.purchaseIds).all<PurchaseRow>();

  const received = action === 'all-received'
    ? results.map((purchase) => ({ purchase, daysAgo: 0 as const }))
    : action === 'partial'
      ? (body.received ?? []).map((item) => ({ purchase: results.find((p) => p.id === item.id), daysAgo: item.daysAgo }))
      : [];
  if (action === 'partial' && received.some((item) => !item.purchase || !isValidArrivalDaysAgo(item.daysAgo))) {
    throw new BadRequestError('받은 항목 또는 수령 날짜가 올바르지 않습니다');
  }

  const receivedIds = new Set<number>();
  for (const item of received) {
    if (!item.purchase) continue;
    await recordArrival(c.env.DB, item.purchase, item.daysAgo as 0 | 1 | 2);
    receivedIds.add(item.purchase.id);
  }
  // 일부 수령에서 고르지 않은 항목, 또는 전부 미도착은 내일 재질문한다. 같은 날 대시보드에는
  // snoozed 상태로 계속 남아, 알림 이후에 도착한 물건도 바로 수령 처리할 수 있다.
  if (action !== 'all-received') {
    const remainingIds = results.filter((p) => !receivedIds.has(p.id)).map((p) => p.id);
    if (remainingIds.length > 0) {
      await c.env.DB.prepare(`UPDATE purchases SET arrival_check_snoozed_until = ?, updated_at = datetime('now') WHERE id IN (${remainingIds.map(() => '?').join(',')})`)
        .bind(addDays(todayDateOnly(), 1), ...remainingIds).run();
    }
  }
  return c.body(null, 204);
});

/** 같은 날 묶인 정기 항목: 선택한 것만 유지하고 나머지는 유지 안 함으로 확정한다. */
push.post('/recurring-batch/:action', async (c) => {
  const action = c.req.param('action');
  const body = await c.req.json<{ token?: string; maintainedIds?: number[] }>()
    .catch(() => ({} as { token?: string; maintainedIds?: number[] }));
  if (!body.token) throw new BadRequestError('token은 필수입니다');
  if (action !== 'all-maintain' && action !== 'partial' && action !== 'all-discontinue') throw new BadRequestError('유효하지 않은 처리입니다');
  const batch = await consumeActionBatchToken(c.env.DB, body.token);
  if (!batch || batch.kind !== 'RECURRING') throw new BadRequestError('유효하지 않거나 이미 처리된 알림이에요');
  const maintained = new Set(action === 'all-maintain' ? batch.purchaseIds : action === 'partial' ? (body.maintainedIds ?? []) : []);
  if (![...maintained].every((id) => batch.purchaseIds.includes(id))) throw new BadRequestError('알림에 없는 항목입니다');
  const today = todayDateOnly();
  for (const id of batch.purchaseIds) {
    if (maintained.has(id)) {
      const purchase = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ? AND user_id = ?')
        .bind(id, batch.userId)
        .first<PurchaseRow>();
      await c.env.DB.prepare(
        `UPDATE purchases SET last_delivered_date = ?, delivery_confirm_count = delivery_confirm_count + 1,
         discontinued_at = NULL, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      ).bind(today, id, batch.userId).run();
      if (purchase) await refreshRecurringFxOnConfirmation(c.env.DB, purchase);
    } else {
      await c.env.DB.prepare(`UPDATE purchases SET discontinued_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
        .bind(id, batch.userId).run();
    }
  }
  return c.body(null, 204);
});

// 대시보드에서도 같은 도착 확인을 할 수 있게, 로그인한 사용자의 소유 항목에 한해 제공한다.
// 푸시 토큰 경로와 달리 이 경로는 일반 인증을 사용하므로, 삭제된 알림을 복구하는 안전한 대체 수단이다.
push.use('/arrival-check/*', authMiddleware);

push.post('/arrival-check/:id/confirm', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const purchaseId = Number(c.req.param('id'));
  const body = await c.req.json<{ daysAgo?: number }>().catch(() => ({}) as { daysAgo?: number });
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) throw new BadRequestError('유효하지 않은 항목입니다');
  if (!isValidArrivalDaysAgo(body.daysAgo)) throw new BadRequestError('daysAgo는 0, 1 또는 2여야 합니다');

  const purchase = await c.env.DB.prepare('SELECT * FROM purchases WHERE id = ? AND user_id = ?')
    .bind(purchaseId, user.id)
    .first<PurchaseRow>();
  if (!purchase) throw new BadRequestError('항목을 찾을 수 없습니다');
  if (purchase.type === 'SUBSCRIPTION') throw new BadRequestError('정기구독 항목은 도착 확인 대상이 아닙니다');

  await recordArrival(c.env.DB, purchase, body.daysAgo);

  return c.body(null, 204);
});

push.post('/arrival-check/:id/snooze', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const purchaseId = Number(c.req.param('id'));
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) throw new BadRequestError('유효하지 않은 항목입니다');

  const result = await c.env.DB.prepare(
    `UPDATE purchases SET arrival_check_snoozed_until = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ? AND type IN ('GENERAL', 'RECURRING_DELIVERY')`
  ).bind(addDays(todayDateOnly(), 1), purchaseId, user.id).run();
  if (result.meta.changes === 0) throw new BadRequestError('도착 확인 대상 항목을 찾을 수 없습니다');

  return c.body(null, 204);
});

export default push;

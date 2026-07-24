import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError } from '../lib/errors';
import { consumeActionToken } from '../lib/action-tokens';
import { confirmReceiptToday, InvalidPurchaseOperationError } from '../lib/purchase-logic';
import type { Env, PurchaseRow, PushSubscriptionRequestBody, UserRow } from '../types';

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

  return c.body(null, 204);
});

export default push;

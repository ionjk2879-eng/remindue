// 토스페이먼츠 결제 연동 — 1회성(30일)/월 정기결제/연 정기결제 세 플랜.
//
// 1회성: 결제창(일반 결제) → 프론트가 리다이렉트로 돌아온 paymentKey/orderId/amount를
//   /confirm에 넘기면 서버가 토스에 승인 확정.
// 월/연: 빌링 인증 위젯(카드 등록) → 리다이렉트로 돌아온 authKey/customerKey를
//   /billing-key/issue에 넘기면 서버가 빌링키를 발급받고 즉시 1회차를 청구한다. 이후 갱신은
//   토스가 자동으로 해주지 않으므로 lib/billing-renewal.ts의 크론이 만료 임박 구독을 찾아
//   같은 빌링키로 매 주기 직접 청구한다.
//
// 금액은 항상 서버(PLAN_CONFIG)가 정하고, 클라이언트가 보낸 amount는 /confirm에서
// "체크아웃 생성 시 서버가 저장해둔 값과 일치하는지"만 검증하는 데 쓴다 — 절대 그 값을
// 그대로 승인 금액으로 신뢰하지 않는다.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError, NotFoundError, PaymentRequiredError } from '../lib/errors';
import { chargeBillingKey, confirmPayment, issueBillingKey, TossApiError } from '../lib/toss';
import { PLAN_CONFIG } from '../lib/billing-plans';
import type { BillingPlan, BillingStatusResponse, Env, PaymentRow, SubscriptionRow, UserRow } from '../types';

const billing = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
billing.use('*', authMiddleware);

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

function requirePlan(value: unknown): BillingPlan {
  if (value !== 'ONE_TIME' && value !== 'MONTHLY' && value !== 'ANNUAL') {
    throw new BadRequestError('plan은 ONE_TIME/MONTHLY/ANNUAL 중 하나여야 합니다');
  }
  return value;
}

/** 결제를 한 번도 시도한 적 없는 사용자는 customer_key가 없으니 최초 체크아웃 시점에 지연 생성한다. */
async function ensureCustomerKey(db: D1Database, user: UserRow): Promise<string> {
  if (user.toss_customer_key) return user.toss_customer_key;
  const customerKey = crypto.randomUUID();
  await db.prepare('UPDATE users SET toss_customer_key = ? WHERE id = ?').bind(customerKey, user.id).run();
  return customerKey;
}

/**
 * premium_expires_at을 연장한다 — 이미 유효 기간이 남아있으면(예: 연 결제 도중 1회성을 추가
 * 구매) 그 시점부터, 아니면(만료됐거나 처음 결제) 지금부터 새 기간만큼 더한다. 즉 뒤에 산
 * 플랜이 앞선 플랜의 남은 기간을 덮어쓰지 않고 쌓인다.
 */
async function extendPremium(db: D1Database, userId: number, periodModifier: string): Promise<string> {
  await db
    .prepare(
      `UPDATE users
          SET premium_expires_at = datetime(
                CASE WHEN premium_expires_at IS NOT NULL AND premium_expires_at > datetime('now')
                     THEN premium_expires_at ELSE datetime('now') END,
                ?
              ),
              is_premium = 1
        WHERE id = ?`
    )
    .bind(periodModifier, userId)
    .run();

  const updated = await db.prepare('SELECT premium_expires_at FROM users WHERE id = ?').bind(userId).first<{
    premium_expires_at: string;
  }>();
  return updated!.premium_expires_at;
}

async function getBillingStatus(db: D1Database, user: UserRow): Promise<BillingStatusResponse> {
  const sub = await db
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ? AND status = 'ACTIVE' ORDER BY current_period_end DESC LIMIT 1`)
    .bind(user.id)
    .first<SubscriptionRow>();

  return {
    isPremium: user.is_premium === 1,
    plan: sub?.plan ?? null,
    premiumExpiresAt: user.premium_expires_at,
    autoRenew: sub?.auto_renew === 1,
  };
}

billing.get('/status', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  return c.json(await getBillingStatus(c.env.DB, user));
});

/** 결제창/빌링 인증 위젯을 열기 전에 서버가 먼저 주문(orderId+금액)을 만들어 저장해둔다. */
billing.post('/checkout', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ plan?: string }>().catch(() => ({}) as { plan?: string });
  const plan = requirePlan(body.plan);
  const config = PLAN_CONFIG[plan];

  const customerKey = await ensureCustomerKey(c.env.DB, user);
  const orderId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO payments (user_id, order_id, plan, amount, status) VALUES (?, ?, ?, ?, 'PENDING')`
  )
    .bind(user.id, orderId, plan, config.amount)
    .run();

  return c.json({ orderId, amount: config.amount, orderName: config.orderName, customerKey });
});

/** 1회성 결제 승인 — 결제창 리다이렉트로 돌아온 paymentKey/orderId/amount를 넘겨받는다. */
billing.post('/confirm', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req
    .json<{ paymentKey?: string; orderId?: string; amount?: number }>()
    .catch(() => ({}) as { paymentKey?: string; orderId?: string; amount?: number });
  if (!body.paymentKey || !body.orderId || typeof body.amount !== 'number') {
    throw new BadRequestError('paymentKey, orderId, amount는 필수입니다');
  }

  const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(body.orderId).first<PaymentRow>();
  if (!payment || payment.user_id !== user.id) {
    throw new NotFoundError('결제 주문을 찾을 수 없습니다');
  }

  // 이미 승인 처리된 주문이면 토스를 다시 호출하지 않고 현재 상태만 그대로 응답한다
  // (새로고침/중복 클릭으로 같은 orderId가 두 번 들어와도 이중 반영되지 않게).
  if (payment.status === 'CONFIRMED') {
    return c.json(await getBillingStatus(c.env.DB, user));
  }

  if (payment.amount !== body.amount) {
    throw new BadRequestError('결제 금액이 체크아웃 생성 시점과 일치하지 않습니다');
  }

  const config = PLAN_CONFIG[payment.plan];

  try {
    await confirmPayment(c.env.TOSS_SECRET_KEY, {
      paymentKey: body.paymentKey,
      orderId: body.orderId,
      amount: body.amount,
    });
  } catch (err) {
    const reason = err instanceof TossApiError ? err.message : '결제 승인에 실패했습니다';
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE id = ?`)
      .bind(reason, payment.id)
      .run();
    throw new PaymentRequiredError(reason);
  }

  const insertedSub = await c.env.DB.prepare(
    `INSERT INTO subscriptions (user_id, plan, status, auto_renew, current_period_end)
     VALUES (?, ?, 'ACTIVE', 0, datetime('now', ?))`
  )
    .bind(user.id, payment.plan, config.periodModifier)
    .run();

  await c.env.DB.prepare(
    `UPDATE payments SET status = 'CONFIRMED', payment_key = ?, subscription_id = ?, confirmed_at = datetime('now') WHERE id = ?`
  )
    .bind(body.paymentKey, insertedSub.meta.last_row_id, payment.id)
    .run();

  await extendPremium(c.env.DB, user.id, config.periodModifier);

  return c.json(await getBillingStatus(c.env.DB, user));
});

/** 월/연 정기결제 — 빌링 인증 위젯 리다이렉트로 돌아온 authKey/customerKey로 빌링키를 발급받고, 1회차를 즉시 청구한다. */
billing.post('/billing-key/issue', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req
    .json<{ authKey?: string; customerKey?: string; plan?: string }>()
    .catch(() => ({}) as { authKey?: string; customerKey?: string; plan?: string });
  const plan = requirePlan(body.plan);
  if (plan === 'ONE_TIME') {
    throw new BadRequestError('billing-key 발급은 MONTHLY/ANNUAL 플랜에서만 가능합니다');
  }
  if (!body.authKey || !body.customerKey) {
    throw new BadRequestError('authKey, customerKey는 필수입니다');
  }
  if (body.customerKey !== user.toss_customer_key) {
    throw new BadRequestError('customerKey가 이 계정의 것이 아닙니다');
  }

  const config = PLAN_CONFIG[plan];

  let billingKey: string;
  try {
    const issued = await issueBillingKey(c.env.TOSS_SECRET_KEY, { authKey: body.authKey, customerKey: body.customerKey });
    billingKey = issued.billingKey;
  } catch (err) {
    const reason = err instanceof TossApiError ? err.message : '카드 등록에 실패했습니다';
    throw new PaymentRequiredError(reason);
  }

  const insertedSub = await c.env.DB.prepare(
    `INSERT INTO subscriptions (user_id, plan, status, auto_renew, toss_billing_key, current_period_end)
     VALUES (?, ?, 'ACTIVE', 1, ?, datetime('now', ?))`
  )
    .bind(user.id, plan, billingKey, config.periodModifier)
    .run();
  const subscriptionId = insertedSub.meta.last_row_id;

  const orderId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO payments (user_id, subscription_id, order_id, plan, amount, status) VALUES (?, ?, ?, ?, ?, 'PENDING')`
  )
    .bind(user.id, subscriptionId, orderId, plan, config.amount)
    .run();

  try {
    const charged = await chargeBillingKey(c.env.TOSS_SECRET_KEY, billingKey, {
      customerKey: body.customerKey,
      amount: config.amount,
      orderId,
      orderName: config.orderName,
    });
    await c.env.DB.prepare(
      `UPDATE payments SET status = 'CONFIRMED', payment_key = ?, confirmed_at = datetime('now') WHERE order_id = ?`
    )
      .bind(charged.paymentKey, orderId)
      .run();
  } catch (err) {
    const reason = err instanceof TossApiError ? err.message : '첫 결제에 실패했습니다';
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE order_id = ?`)
      .bind(reason, orderId)
      .run();
    // 카드는 등록됐지만 첫 결제가 실패한 상태 — 프리미엄은 부여하지 않고, 구독은 재시도 가능하도록
    // PAST_DUE로 표시해둔다(자동 갱신 크론이 auto_renew=1인 ACTIVE만 보므로 PAST_DUE는 건드리지 않는다).
    await c.env.DB.prepare(`UPDATE subscriptions SET status = 'PAST_DUE' WHERE id = ?`).bind(subscriptionId).run();
    throw new PaymentRequiredError(reason);
  }

  await extendPremium(c.env.DB, user.id, config.periodModifier);

  return c.json(await getBillingStatus(c.env.DB, user));
});

export default billing;

// 카카오페이 단건결제 — 토스와 별도 파일로 둔 이유는 /success·/cancel·/fail이 카카오페이 서버가
// "사용자 브라우저를 리다이렉트"시켜 도착하는 주소라 로그인 세션(Authorization 헤더)이 없기
// 때문이다(routes/push.ts의 인증 없는 콜백 엔드포인트들과 같은 이유). 그래서 billing.ts처럼
// 라우터 전체에 authMiddleware를 걸 수 없고, /checkout에만 개별적으로 건다.
//
// index.ts에 `/api/billing`이 아니라 `/api/kakao-billing`으로 마운트한다 — billing.ts가
// `/api/billing/*` 전체에 authMiddleware를 걸어두는데, 그 밑에 이 라우터를 마운트하면(예:
// `/api/billing/kakao`) Hono가 두 마운트를 같은 라우팅 테이블에 합치면서 그 와일드카드
// 미들웨어가 여기도 적용돼버린다. 그러면 인증 세션 없이 돌아오는 /success 콜백이 리다이렉트가
// 아니라 "인증이 필요합니다" JSON 에러로 그 자리에서 멈춰버린다 — 실제로 겪은 버그.
//
// 지금은 카카오페이 심사(가맹점 등록) 전이라 공개 테스트 CID(TC0ONETIME)로만 동작한다 — 실제
// 결제는 되지 않고, 결제 흐름 자체를 확인/캡처하는 용도다. 심사 통과 후에는 KAKAOPAY_CID를
// 발급받은 실 가맹점 코드로 바꾸기만 하면 된다.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError } from '../lib/errors';
import { approvePayment, readyPayment, KakaoPayApiError, KAKAOPAY_PUBLIC_TEST_CIDS } from '../lib/kakaopay';
import { PLAN_CONFIG } from '../lib/billing-plans';
import { extendPremium } from './billing';
import { logger } from '../lib/logger';
import type { BillingPlan, Env, PaymentRow, UserRow } from '../types';

const billingKakao = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

billingKakao.use('*', async (c, next) => {
  if (c.env.BILLING_SUSPENDED === 'true') {
    return c.json({ message: '현재 신규 결제가 일시 중단되어 있습니다.' }, 503);
  }
  return next();
});

/** 심사 통과 후 CID를 실 가맹점 코드로 바꾸는 걸 잊었는지 프로덕션에서 계속 확인한다. */
function warnIfTestCidInProduction(env: Env, route: string, cid: string): void {
  if (env.ENVIRONMENT === 'production' && KAKAOPAY_PUBLIC_TEST_CIDS.has(cid)) {
    logger.warn('kakaopay.test_cid_in_production', { route, cid });
  }
}

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  return user;
}

/** 결제창을 열기 전에 서버가 먼저 주문을 만들고, 카카오페이에 결제를 준비 요청해 리다이렉트 URL을 받아온다. */
billingKakao.use('/checkout', authMiddleware);
billingKakao.post('/checkout', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const config = PLAN_CONFIG.ONE_TIME; // 공개 테스트 CID(TC0ONETIME)는 단건결제 전용이라 우선 1회성만 지원한다.
  const orderId = crypto.randomUUID();
  warnIfTestCidInProduction(c.env, 'checkout', c.env.KAKAOPAY_CID);

  await c.env.DB.prepare(
    `INSERT INTO payments (user_id, order_id, plan, amount, status, pg_provider) VALUES (?, ?, 'ONE_TIME', ?, 'PENDING', 'KAKAOPAY')`
  )
    .bind(user.id, orderId, config.amount)
    .run();

  const apiOrigin = new URL(c.req.url).origin;
  // 운영/개발 프리뷰가 같은 워커 배포본을 공유해 env.APP_URL 하나로 고정할 수 없다 — 체크아웃을
  // 요청한 실제 프론트엔드 출처(Origin 헤더)를 콜백 URL에 실어 보내, 나중에 그 사이트로 돌아간다.
  const frontendOrigin = c.req.header('Origin') ?? c.env.APP_URL;
  const returnParams = `orderId=${orderId}&origin=${encodeURIComponent(frontendOrigin)}`;

  try {
    const ready = await readyPayment(c.env.KAKAOPAY_SECRET_KEY, {
      cid: c.env.KAKAOPAY_CID,
      partnerOrderId: orderId,
      partnerUserId: String(user.id),
      itemName: config.orderName,
      quantity: 1,
      totalAmount: config.amount,
      taxFreeAmount: 0,
      approvalUrl: `${apiOrigin}/api/kakao-billing/success?${returnParams}`,
      cancelUrl: `${apiOrigin}/api/kakao-billing/cancel?${returnParams}`,
      failUrl: `${apiOrigin}/api/kakao-billing/fail?${returnParams}`,
    });

    await c.env.DB.prepare(`UPDATE payments SET payment_key = ? WHERE order_id = ?`).bind(ready.tid, orderId).run();

    return c.json({
      redirectUrlPc: ready.next_redirect_pc_url,
      redirectUrlMobile: ready.next_redirect_mobile_url,
    });
  } catch (err) {
    const reason = err instanceof KakaoPayApiError ? err.message : '카카오페이 결제 준비에 실패했습니다';
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE order_id = ?`)
      .bind(reason, orderId)
      .run();
    throw new BadRequestError(reason);
  }
});

function returnOrigin(c: { req: { query: (key: string) => string | undefined }; env: Env }): string {
  return c.req.query('origin') ?? c.env.APP_URL;
}

function requireSubscriptionPlan(value: unknown): 'MONTHLY' {
  if (value !== 'MONTHLY') {
    throw new BadRequestError('plan은 MONTHLY여야 합니다');
  }
  return value;
}

/** 사용자가 카카오페이 인증을 마치고 돌아오는 곳 — 로그인 세션이 없으므로 orderId로만 결제를 찾는다. */
billingKakao.get('/success', async (c) => {
  const orderId = c.req.query('orderId');
  const pgToken = c.req.query('pg_token');
  const origin = returnOrigin(c);
  if (!orderId || !pgToken) return c.redirect(`${origin}/billing/fail?method=kakao`);

  const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(orderId).first<PaymentRow>();
  if (!payment) return c.redirect(`${origin}/billing/fail?method=kakao`);
  if (payment.status === 'CONFIRMED') return c.redirect(`${origin}/billing/success?method=kakao`);

  try {
    await approvePayment(c.env.KAKAOPAY_SECRET_KEY, {
      cid: c.env.KAKAOPAY_CID,
      tid: payment.payment_key ?? '',
      partnerOrderId: orderId,
      partnerUserId: String(payment.user_id),
      pgToken,
    });
  } catch (err) {
    const reason = err instanceof KakaoPayApiError ? err.message : '카카오페이 결제 승인에 실패했습니다';
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE id = ?`)
      .bind(reason, payment.id)
      .run();
    return c.redirect(`${origin}/billing/fail?method=kakao`);
  }

  const config = PLAN_CONFIG[payment.plan];
  await c.env.DB.prepare(`UPDATE payments SET status = 'CONFIRMED', confirmed_at = datetime('now') WHERE id = ?`)
    .bind(payment.id)
    .run();
  await extendPremium(c.env.DB, payment.user_id, config.periodModifier);

  return c.redirect(`${origin}/billing/success?method=kakao`);
});

billingKakao.get('/cancel', async (c) => {
  const orderId = c.req.query('orderId');
  if (orderId) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '사용자 취소' WHERE order_id = ?`)
      .bind(orderId)
      .run();
  }
  return c.redirect(`${returnOrigin(c)}/billing/fail?method=kakao`);
});

billingKakao.get('/fail', async (c) => {
  const orderId = c.req.query('orderId');
  if (orderId) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '결제 실패' WHERE order_id = ?`)
      .bind(orderId)
      .run();
  }
  return c.redirect(`${returnOrigin(c)}/billing/fail?method=kakao`);
});

/**
 * 정기결제 등록 — 별도 정기결제 CID로 ready/approve를 호출한다(단건과 같은 엔드포인트, cid만
 * 다르다). 승인 응답의 sid가 토스의 billing_key와 같은 역할(이후 매 주기 청구에 계속 씀)을 한다.
 */
billingKakao.use('/subscribe', authMiddleware);
billingKakao.post('/subscribe', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ plan?: string }>().catch(() => ({}) as { plan?: string });
  const plan = requireSubscriptionPlan(body.plan);
  const config = PLAN_CONFIG[plan];
  const orderId = crypto.randomUUID();
  warnIfTestCidInProduction(c.env, 'subscribe', c.env.KAKAOPAY_SUBSCRIPTION_CID);

  await c.env.DB.prepare(
    `INSERT INTO payments (user_id, order_id, plan, amount, status, pg_provider) VALUES (?, ?, ?, ?, 'PENDING', 'KAKAOPAY')`
  )
    .bind(user.id, orderId, plan, config.amount)
    .run();

  const apiOrigin = new URL(c.req.url).origin;
  const frontendOrigin = c.req.header('Origin') ?? c.env.APP_URL;
  const returnParams = `orderId=${orderId}&origin=${encodeURIComponent(frontendOrigin)}`;

  try {
    const ready = await readyPayment(c.env.KAKAOPAY_SECRET_KEY, {
      cid: c.env.KAKAOPAY_SUBSCRIPTION_CID,
      partnerOrderId: orderId,
      partnerUserId: String(user.id),
      itemName: config.orderName,
      quantity: 1,
      totalAmount: config.amount,
      taxFreeAmount: 0,
      approvalUrl: `${apiOrigin}/api/kakao-billing/subscribe-success?${returnParams}`,
      cancelUrl: `${apiOrigin}/api/kakao-billing/subscribe-cancel?${returnParams}`,
      failUrl: `${apiOrigin}/api/kakao-billing/subscribe-fail?${returnParams}`,
    });

    await c.env.DB.prepare(`UPDATE payments SET payment_key = ? WHERE order_id = ?`).bind(ready.tid, orderId).run();

    return c.json({
      redirectUrlPc: ready.next_redirect_pc_url,
      redirectUrlMobile: ready.next_redirect_mobile_url,
    });
  } catch (err) {
    const reason = err instanceof KakaoPayApiError ? err.message : '카카오페이 정기결제 등록 준비에 실패했습니다';
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE order_id = ?`)
      .bind(reason, orderId)
      .run();
    throw new BadRequestError(reason);
  }
});

billingKakao.get('/subscribe-success', async (c) => {
  const orderId = c.req.query('orderId');
  const pgToken = c.req.query('pg_token');
  const origin = returnOrigin(c);
  if (!orderId || !pgToken) return c.redirect(`${origin}/billing/fail?method=kakao`);

  const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(orderId).first<PaymentRow>();
  if (!payment) return c.redirect(`${origin}/billing/fail?method=kakao`);
  if (payment.status === 'CONFIRMED') return c.redirect(`${origin}/billing/success?method=kakao`);

  let sid: string | undefined;
  try {
    const approved = await approvePayment(c.env.KAKAOPAY_SECRET_KEY, {
      cid: c.env.KAKAOPAY_SUBSCRIPTION_CID,
      tid: payment.payment_key ?? '',
      partnerOrderId: orderId,
      partnerUserId: String(payment.user_id),
      pgToken,
    });
    sid = approved.sid;
  } catch (err) {
    const reason = err instanceof KakaoPayApiError ? err.message : '카카오페이 정기결제 등록 승인에 실패했습니다';
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = ? WHERE id = ?`)
      .bind(reason, payment.id)
      .run();
    return c.redirect(`${origin}/billing/fail?method=kakao`);
  }
  if (!sid) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '카카오페이 응답에 sid가 없습니다' WHERE id = ?`)
      .bind(payment.id)
      .run();
    return c.redirect(`${origin}/billing/fail?method=kakao`);
  }

  const plan = payment.plan as BillingPlan;
  const config = PLAN_CONFIG[plan];
  const insertedSub = await c.env.DB.prepare(
    `INSERT INTO subscriptions (user_id, plan, status, auto_renew, kakao_sid, current_period_end)
     VALUES (?, ?, 'ACTIVE', 1, ?, datetime('now', ?))`
  )
    .bind(payment.user_id, plan, sid, config.periodModifier)
    .run();

  await c.env.DB.prepare(
    `UPDATE payments SET status = 'CONFIRMED', subscription_id = ?, confirmed_at = datetime('now') WHERE id = ?`
  )
    .bind(insertedSub.meta.last_row_id, payment.id)
    .run();
  await extendPremium(c.env.DB, payment.user_id, config.periodModifier);

  return c.redirect(`${origin}/billing/success?method=kakao`);
});

billingKakao.get('/subscribe-cancel', async (c) => {
  const orderId = c.req.query('orderId');
  if (orderId) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '사용자 취소' WHERE order_id = ?`)
      .bind(orderId)
      .run();
  }
  return c.redirect(`${returnOrigin(c)}/billing/fail?method=kakao`);
});

billingKakao.get('/subscribe-fail', async (c) => {
  const orderId = c.req.query('orderId');
  if (orderId) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '정기결제 등록 실패' WHERE order_id = ?`)
      .bind(orderId)
      .run();
  }
  return c.redirect(`${returnOrigin(c)}/billing/fail?method=kakao`);
});

export default billingKakao;

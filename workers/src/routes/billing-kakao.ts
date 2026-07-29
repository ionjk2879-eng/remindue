// 카카오페이 단건결제 — 토스와 별도 파일로 둔 이유는 /success·/cancel·/fail이 카카오페이 서버가
// "사용자 브라우저를 리다이렉트"시켜 도착하는 주소라 로그인 세션(Authorization 헤더)이 없기
// 때문이다(routes/push.ts의 인증 없는 콜백 엔드포인트들과 같은 이유). 그래서 billing.ts처럼
// 라우터 전체에 authMiddleware를 걸 수 없고, /checkout에만 개별적으로 건다.
//
// 지금은 카카오페이 심사(가맹점 등록) 전이라 공개 테스트 CID(TC0ONETIME)로만 동작한다 — 실제
// 결제는 되지 않고, 결제 흐름 자체를 확인/캡처하는 용도다. 심사 통과 후에는 KAKAOPAY_CID를
// 발급받은 실 가맹점 코드로 바꾸기만 하면 된다.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError } from '../lib/errors';
import { approvePayment, readyPayment, KakaoPayApiError } from '../lib/kakaopay';
import { PLAN_CONFIG } from '../lib/billing-plans';
import { extendPremium } from './billing';
import type { Env, PaymentRow, UserRow } from '../types';

const billingKakao = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

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

  await c.env.DB.prepare(
    `INSERT INTO payments (user_id, order_id, plan, amount, status, pg_provider) VALUES (?, ?, 'ONE_TIME', ?, 'PENDING', 'KAKAOPAY')`
  )
    .bind(user.id, orderId, config.amount)
    .run();

  const base = new URL(c.req.url).origin;
  try {
    const ready = await readyPayment(c.env.KAKAOPAY_SECRET_KEY, {
      cid: c.env.KAKAOPAY_CID,
      partnerOrderId: orderId,
      partnerUserId: String(user.id),
      itemName: config.orderName,
      quantity: 1,
      totalAmount: config.amount,
      taxFreeAmount: 0,
      approvalUrl: `${base}/api/billing/kakao/success?orderId=${orderId}`,
      cancelUrl: `${base}/api/billing/kakao/cancel?orderId=${orderId}`,
      failUrl: `${base}/api/billing/kakao/fail?orderId=${orderId}`,
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

/** 사용자가 카카오페이 인증을 마치고 돌아오는 곳 — 로그인 세션이 없으므로 orderId로만 결제를 찾는다. */
billingKakao.get('/success', async (c) => {
  const orderId = c.req.query('orderId');
  const pgToken = c.req.query('pg_token');
  const appUrl = c.env.APP_URL;
  if (!orderId || !pgToken) return c.redirect(`${appUrl}/billing/fail?method=kakao`);

  const payment = await c.env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(orderId).first<PaymentRow>();
  if (!payment) return c.redirect(`${appUrl}/billing/fail?method=kakao`);
  if (payment.status === 'CONFIRMED') return c.redirect(`${appUrl}/billing/success?method=kakao`);

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
    return c.redirect(`${appUrl}/billing/fail?method=kakao`);
  }

  const config = PLAN_CONFIG[payment.plan];
  await c.env.DB.prepare(`UPDATE payments SET status = 'CONFIRMED', confirmed_at = datetime('now') WHERE id = ?`)
    .bind(payment.id)
    .run();
  await extendPremium(c.env.DB, payment.user_id, config.periodModifier);

  return c.redirect(`${appUrl}/billing/success?method=kakao`);
});

billingKakao.get('/cancel', async (c) => {
  const orderId = c.req.query('orderId');
  if (orderId) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '사용자 취소' WHERE order_id = ?`)
      .bind(orderId)
      .run();
  }
  return c.redirect(`${c.env.APP_URL}/billing/fail?method=kakao`);
});

billingKakao.get('/fail', async (c) => {
  const orderId = c.req.query('orderId');
  if (orderId) {
    await c.env.DB.prepare(`UPDATE payments SET status = 'FAILED', failure_reason = '결제 실패' WHERE order_id = ?`)
      .bind(orderId)
      .run();
  }
  return c.redirect(`${c.env.APP_URL}/billing/fail?method=kakao`);
});

export default billingKakao;

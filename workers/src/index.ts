import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import purchaseRoutes from './routes/purchases';
import pushRoutes from './routes/push';
import pendingPurchaseRoutes from './routes/pending-purchases';
import { HttpError } from './lib/errors';
import { runDailyDigest } from './lib/digest';
import { handleIncomingEmail } from './lib/email-intake';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

app.route('/api/auth', authRoutes);
app.route('/api/purchases', purchaseRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/pending-purchases', pendingPurchaseRoutes);

// GlobalExceptionHandler.java와 동일한 매핑: {message}, 상태코드는 에러 종류에 따라 결정
//
// hono/cors는 next()가 정상 반환된 응답에만 Access-Control-Allow-Origin을 붙인다 —
// 핸들러가 throw하면 onError가 새 Response를 만들면서 그 헤더가 유실되어, 브라우저가
// 4xx/5xx 응답 자체를 CORS 에러로 막아버린다(axios interceptor의 401 처리도 못 탐).
// 그래서 에러 응답에도 동일한 CORS 헤더를 직접 다시 붙여준다.
app.onError((err, c) => {
  const origin = c.req.header('Origin');
  if (origin && origin === c.env.CORS_ORIGIN) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Vary', 'Origin');
  }

  if (err instanceof HttpError) {
    return c.json({ message: err.message }, err.status as never);
  }
  console.error(err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

export default {
  fetch: app.fetch,
  // Cron Trigger(wrangler.jsonc의 triggers.crons) — 매일 1회 D-day 다이제스트 이메일 발송.
  scheduled: async (_event, env, ctx) => {
    ctx.waitUntil(
      runDailyDigest(env).then((result) => {
        console.log(
          `[daily-digest] 완료 — 대상 사용자 ${result.usersNotified}명, 이메일 ${result.emailsSent}건, 푸시 ${result.pushSent}건, 만료 구독 정리 ${result.pushSubscriptionsPruned}건`
        );
      })
    );
  },
  // Cloudflare Email Routing 라우팅 규칙(액션: "Send to a Worker")이 이 Worker로 넘겨주는 메일.
  // add-{forwarding_token}@{도메인}으로 온 메일만 처리하고, 그 외 형식/미확인 토큰/주문확인이
  // 아닌 메일은 email-intake.ts에서 조용히 무시한다.
  email: async (message, env) => {
    await handleIncomingEmail(message, env);
  },
} satisfies ExportedHandler<Env>;

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import purchaseRoutes from './routes/purchases';
import pushRoutes from './routes/push';
import pendingPurchaseRoutes from './routes/pending-purchases';
import billingRoutes from './routes/billing';
import settingsRoutes from './routes/settings';
import sharingRoutes from './routes/sharing';
import feedbackRoutes from './routes/feedback';
import devRoutes from './routes/dev';
import { HttpError } from './lib/errors';
import { runDailyDigest } from './lib/digest';
import { runWeeklyDigest } from './lib/weekly-digest';
import { runBillingRenewals, runPremiumExpirySweep } from './lib/billing-renewal';
import { handleIncomingEmail } from './lib/email-intake';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// CORS_ORIGIN은 콤마로 구분된 여러 출처를 담을 수 있다 — 커스텀 도메인(remindue.kr)을 붙인
// 뒤에도 예전 workers.dev 프론트엔드 주소나 로컬 개발 주소가 계속 동작하게 하기 위함.
function allowedOrigins(env: Env): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

app.use('/api/*', async (c, next) => {
  const corsMiddleware = cors({
    origin: allowedOrigins(c.env),
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
app.route('/api/billing', billingRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/sharing', sharingRoutes);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/dev', devRoutes);

// GlobalExceptionHandler.java와 동일한 매핑: {message}, 상태코드는 에러 종류에 따라 결정
//
// hono/cors는 next()가 정상 반환된 응답에만 Access-Control-Allow-Origin을 붙인다 —
// 핸들러가 throw하면 onError가 새 Response를 만들면서 그 헤더가 유실되어, 브라우저가
// 4xx/5xx 응답 자체를 CORS 에러로 막아버린다(axios interceptor의 401 처리도 못 탐).
// 그래서 에러 응답에도 동일한 CORS 헤더를 직접 다시 붙여준다.
app.onError((err, c) => {
  const origin = c.req.header('Origin');
  if (origin && allowedOrigins(c.env).includes(origin)) {
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
  scheduled: async (event, env, ctx) => {
    ctx.waitUntil(
      runDailyDigest(env).then((result) => {
        console.log(
          `[daily-digest] 완료 — 대상 사용자 ${result.usersNotified}명, 이메일 ${result.emailsSent}건, 푸시 ${result.pushSent}건, 만료 구독 정리 ${result.pushSubscriptionsPruned}건`
        );
      })
    );

    // 크론은 매일 UTC 0시(KST 9시)에 도는데, 그 시각엔 UTC 날짜가 아직 안 넘어가 있어서
    // getUTCDay()가 KST 기준 요일과 그대로 일치한다(1=월요일). 정기배송 주간 리포트는
    // 프리미엄 알림 기능이라 매주 이때만 한 번 더 실행한다.
    // 개발 환경(ENVIRONMENT=development)에서는 요일과 무관하게 항상 실행한다 — 월요일을
    // 기다리지 않고 /cdn-cgi/handler/scheduled로 강제 트리거해서 바로 테스트할 수 있게.
    const isMonday = new Date(event.scheduledTime).getUTCDay() === 1;
    if (isMonday || env.ENVIRONMENT === 'development') {
      ctx.waitUntil(
        runWeeklyDigest(env).then((result) => {
          console.log(
            `[weekly-digest] 완료 — 대상 사용자 ${result.usersNotified}명, 이메일 ${result.emailsSent}건, 푸시 ${result.pushSent}건, 만료 구독 정리 ${result.pushSubscriptionsPruned}건`
          );
        })
      );
    }

    // 정기결제 자동 갱신은 매일 확인한다(요일 무관 — 만료가 임박한 구독마다 날짜가 다르므로).
    // 갱신을 먼저 끝낸 뒤에 만료 스윕을 돌려야, 방금 갱신된 사용자가 스윕에 잘못 걸리지 않는다.
    ctx.waitUntil(
      runBillingRenewals(env)
        .then((result) => {
          console.log(
            `[billing-renewal] 완료 — 시도 ${result.attempted}건, 갱신 ${result.renewed}건, 실패 ${result.failed}건, 다운그레이드 ${result.downgraded}건`
          );
          return runPremiumExpirySweep(env);
        })
        .then((result) => {
          console.log(`[premium-expiry-sweep] 완료 — 만료 처리 ${result.demoted}명`);
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

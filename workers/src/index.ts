import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import purchaseRoutes from './routes/purchases';
import pushRoutes from './routes/push';
import pendingPurchaseRoutes from './routes/pending-purchases';
import googleAuthRoutes from './routes/auth-google';
import settingsRoutes from './routes/settings';
import sharingRoutes from './routes/sharing';
import devRoutes from './routes/dev';
import aiSummaryRoutes from './routes/ai-summary';
import appUpdateRoutes from './routes/app-update';
import configRoutes from './routes/config';
import fxRecalculationRoutes from './routes/fx-recalculation';
import { HttpError } from './lib/errors';
import { runDailyDigest } from './lib/digest';
import { runWeeklyDigest } from './lib/weekly-digest';
import { runConfirmationNudge } from './lib/confirmation-nudge';
import { rollOverUnansweredArrivals, runArrivalConfirm } from './lib/arrival-confirm';
import { handleIncomingEmail } from './lib/email-intake';
import { notifyCronFailure } from './lib/cron-alert';
import type { Env } from './types';
import { logger } from './lib/logger';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-ID') ?? crypto.randomUUID();
  c.header('X-Request-ID', requestId);
  const startedAt = Date.now();
  await next();
  logger.info('http.request', {
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
});

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

// APK 등 대용량 파일은 Workers 정적 자산(25MB 제한)이 아니라 R2에서 직접 서빙한다. /api 밑에
// 두지 않는 이유는 그냥 다운로드 링크라 CORS/인증 미들웨어가 필요 없기 때문이다.
app.get('/downloads/:filename', async (c) => {
  const filename = c.req.param('filename');
  const object = await c.env.DOWNLOADS_BUCKET.get(filename);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(object.size),
      'Cache-Control': 'public, max-age=300',
    },
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/auth', googleAuthRoutes);
app.route('/api/purchases', purchaseRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/pending-purchases', pendingPurchaseRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/sharing', sharingRoutes);
app.route('/api/dev', devRoutes);
app.route('/api/ai', aiSummaryRoutes);
app.route('/api/app-update', appUpdateRoutes);
app.route('/api/config', configRoutes);
app.route('/api/fx-recalculation', fxRecalculationRoutes);

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
  logger.error('http.unhandled_error', {
    requestId: c.res.headers.get('X-Request-ID'),
    error: err instanceof Error ? err.message : String(err),
  });
  return c.json({ message: 'Internal Server Error' }, 500);
});

export default {
  fetch: app.fetch,
  // UTC 0시(KST 09:00)는 기존 일일 요약, UTC 6시(KST 15:00)는 배송 도착 확인 전용이다.
  scheduled: async (event, env, ctx) => {
    const scheduledAt = new Date(event.scheduledTime);
    const scheduledUtcHour = scheduledAt.getUTCHours();
    const scheduledUtcMinute = scheduledAt.getUTCMinutes();
    // UTC 15시 = KST 자정. 전날 도착 확인에 답하지 않은 건을 "아직요" 상태로 넘겨,
    // 다음 날 오후 도착 확인 알림에서 다시 물을 수 있게 한다.
    if (scheduledUtcHour === 15) {
      // "모두 중단"은 해당 회차일까지는 보존하고, 다음 날 자정에 목록과 알림 대상에서 종료한다.
      ctx.waitUntil(
        env.DB.prepare(
          `UPDATE purchases
              SET discontinued_at = datetime('now'), updated_at = datetime('now')
            WHERE stop_after_current_at IS NOT NULL
              AND stop_after_current_at < date('now', '+9 hours')
              AND discontinued_at IS NULL`
        ).run().then((result) => {
          console.log(`[recurring-stop-after-current] ended ${result.meta.changes ?? 0}`);
        }).catch((err) => notifyCronFailure(env, 'recurring-stop-after-current', err))
      );
      ctx.waitUntil(
        rollOverUnansweredArrivals(env).then((count) => {
          console.log(`[arrival-confirm-rollover] 무응답 항목 ${count}건을 다음 날 재확인 대상으로 전환`);
        }).catch((err) => notifyCronFailure(env, 'arrival-confirm-rollover', err))
      );
      return;
    }
    if (scheduledUtcHour === 10) {
      ctx.waitUntil(
        runArrivalConfirm(env).then((result) => {
          console.log(
            `[arrival-confirm] 완료 — 대상 항목 ${result.itemsAsked}건, 푸시 ${result.pushSent}건, 만료 구독 정리 ${result.pushSubscriptionsPruned}건`
          );
        }).catch((err) => notifyCronFailure(env, 'arrival-confirm', err))
      );
      return;
    }
    // "확인이 필요한 항목" 알림은 매일 확인해야 한다(요일 무관) — dDay===3(예고)/dDay===-1(완료
    // 확인) 조건이 요일과 무관하게 아무 날에나 걸릴 수 있어서, 주 1회만 체크하면 그 요일에 안
    // 걸리는 구독은 영영 못 잡는다. "일주일 기준"이라는 요구사항은 크론 주기가 아니라 구독
    // 하나당 결제 주기가 보통 한 달 이상이라 자연히 자주 오지 않는다는 뜻으로 구현했다.
    if (scheduledUtcHour === 1) {
      ctx.waitUntil(runConfirmationNudge(env).catch((err) => notifyCronFailure(env, 'confirmation-nudge', err)));
      return;
    }
    if (scheduledUtcHour !== 23 || scheduledUtcMinute !== 30) return;

    ctx.waitUntil(
      runDailyDigest(env).then((result) => {
        console.log(
          `[daily-digest] 완료 — 대상 사용자 ${result.usersNotified}명, 이메일 ${result.emailsSent}건, 푸시 ${result.pushSent}건, 만료 구독 정리 ${result.pushSubscriptionsPruned}건`
        );
      }).catch((err) => notifyCronFailure(env, 'daily-digest', err))
    );

    // 크론은 매일 UTC 0시(KST 9시)에 도는데, 그 시각엔 UTC 날짜가 아직 안 넘어가 있어서
    // getUTCDay()가 KST 기준 요일과 그대로 일치한다(1=월요일). 정기배송 주간 리포트는
    // 프리미엄 알림 기능이라 매주 이때만 한 번 더 실행한다.
    // 개발 환경(ENVIRONMENT=development)에서는 요일과 무관하게 항상 실행한다 — 월요일을
    // 기다리지 않고 /cdn-cgi/handler/scheduled로 강제 트리거해서 바로 테스트할 수 있게.
    const isMonday = new Date(event.scheduledTime + 9 * 60 * 60 * 1000).getUTCDay() === 1;
    if (isMonday || env.ENVIRONMENT === 'development') {
      ctx.waitUntil(
        runWeeklyDigest(env).then((result) => {
          console.log(
            `[weekly-digest] 완료 — 대상 사용자 ${result.usersNotified}명, 이메일 ${result.emailsSent}건, 푸시 ${result.pushSent}건, 만료 구독 정리 ${result.pushSubscriptionsPruned}건`
          );
        }).catch((err) => notifyCronFailure(env, 'weekly-digest', err))
      );
    }

    // 2일 넘은 로그인 시도 기록은 더 이상 rate limiting 판단에 쓰이지 않으니 정리한다.
    // 무한 누적을 막기 위해 매일 한 번 돌리는 것으로 충분하다.
    ctx.waitUntil(
      env.DB.prepare(`DELETE FROM rate_limit_attempts WHERE window_started_at < datetime('now', '-2 days')`)
        .run()
        .then((result) => {
          if ((result.meta.changes ?? 0) > 0) {
            console.log(`[rate-limit-cleanup] ${result.meta.changes}건의 만료된 시도 기록 삭제`);
          }
        })
        .catch((err) => notifyCronFailure(env, 'rate-limit-cleanup', err))
    );
  },
  // Cloudflare Email Routing 라우팅 규칙(액션: "Send to a Worker")이 이 Worker로 넘겨주는 메일.
  // add-{forwarding_token}@{도메인}으로 온 메일만 처리하고, 그 외 형식/미확인 토큰/주문확인이
  // 아닌 메일은 email-intake.ts에서 조용히 무시한다.
  email: async (message, env) => {
    await handleIncomingEmail(message, env);
  },
} satisfies ExportedHandler<Env>;

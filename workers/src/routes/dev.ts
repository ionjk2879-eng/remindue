// 개발 전용 테스트 도구 — "이번 주 배송 예정" 같은 기능을 과거 날짜 데이터를 수동으로
// 만들거나 월요일 크론을 기다리지 않고 바로 확인할 수 있게 해준다.
// ENVIRONMENT가 "development"(로컬 .dev.vars, dev 프리뷰 --var 오버라이드)가 아니면 항상
// 404 — production 배포본(운영 remindue Worker)에서는 이 라우트 자체가 존재하지 않는 것처럼 동작한다.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { NotFoundError } from '../lib/errors';
import { addDays, todayDateOnly } from '../lib/date';
import { runWeeklyDigest } from '../lib/weekly-digest';
import { runBillingRenewals, runPremiumExpirySweep } from '../lib/billing-renewal';
import type { Env, UserRow } from '../types';

const dev = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
dev.use('*', authMiddleware);

/**
 * 오늘 기준 n일 전 날짜(yyyy-MM-dd) — purchase-logic.ts의 computeDeadline이 실제로 쓰는
 * todayDateOnly()(KST 기준)를 그대로 재사용한다. 여기서 UTC 기준으로 따로 계산하면 KST/UTC
 * 자정 경계 근처에서 하루 어긋나서(date.ts 상단 주석 참고) 시드한 항목의 dDay/회차가 의도한
 * 값과 안 맞을 수 있다.
 */
function daysAgo(n: number): string {
  return addDays(todayDateOnly(), -n);
}

interface SeedItem {
  itemName: string;
  baseDate: string;
  intervalDays: number;
}

/**
 * 로그인한 계정에 정기배송 항목을 심는다 — dDay가 0~7 범위라 "이번 주 배송 예정" 배너에 걸린다:
 * - baseDate 3일 전 + 7일 주기 → dDay=4(이번 주)
 */
dev.post('/seed-test-data', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    throw new NotFoundError('Not Found');
  }

  const email = c.get('userEmail');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new NotFoundError(`사용자를 찾을 수 없습니다: ${email}`);
  }

  const items: SeedItem[] = [{ itemName: '[테스트] 이번 주 배송 예정 데모', baseDate: daysAgo(3), intervalDays: 7 }];

  for (const item of items) {
    await c.env.DB.prepare(
      `INSERT INTO purchases (user_id, type, item_name, base_date, interval_days, delivery_confirm_count)
       VALUES (?, 'RECURRING_DELIVERY', ?, ?, ?, 0)`
    )
      .bind(user.id, item.itemName, item.baseDate, item.intervalDays)
      .run();
  }

  return c.json({ seeded: items.map((item) => item.itemName) });
});

/**
 * runWeeklyDigest를 요일 조건 없이 즉시 실행한다. `/cdn-cgi/handler/scheduled`는 wrangler dev
 * 로컬 전용 테스트 기능이라 배포된 dev 프리뷰에는 없다 — 배포본에서 월요일을 기다리지 않고
 * 실제 이메일/푸시 발송까지 확인하고 싶을 때 이 엔드포인트를 쓴다.
 */
dev.post('/run-weekly-digest', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    throw new NotFoundError('Not Found');
  }

  const result = await runWeeklyDigest(c.env);
  return c.json(result);
});

/**
 * 정기결제 자동 갱신 크론(runBillingRenewals + runPremiumExpirySweep)을 매일 크론을
 * 기다리지 않고 즉시 실행한다. current_period_end를 과거로 만들어둔 테스트 구독을
 * 실제로 재청구해서 갱신/실패 경로를 바로 확인할 때 쓴다.
 */
dev.post('/run-billing-renewal', async (c) => {
  if (c.env.ENVIRONMENT !== 'development') {
    throw new NotFoundError('Not Found');
  }

  const renewalResult = await runBillingRenewals(c.env);
  const sweepResult = await runPremiumExpirySweep(c.env);
  return c.json({ ...renewalResult, ...sweepResult });
});

export default dev;

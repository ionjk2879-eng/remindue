// 사용자 설정 — 닉네임 변경, 커스텀 알림 시점(프리미엄) 등 계정 단위 설정.
// purchases.ts/billing.ts와 같은 패턴: 이 라우터 전체가 인증 필요.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError, PaymentRequiredError } from '../lib/errors';
import {
  effectiveNotificationDays,
  parseNotificationDays,
  serializeNotificationDays,
  validateNotificationDaysInput,
  InvalidNotificationDaysError,
} from '../lib/notification-prefs';
import type { Env, UserRow } from '../types';

const settings = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
settings.use('*', authMiddleware);

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

settings.get('/notification-days', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  return c.json({
    notificationDays: effectiveNotificationDays(user.is_premium === 1, user.notification_days),
    // 무료 플랜이어도 예전에 프리미엄이었을 때 저장해둔 값은 그대로 보여준다 — 다시 프리미엄이
    // 되면 이 값이 살아난다는 걸 설정 화면에서 알 수 있게. 실제 알림에는 위 notificationDays만 쓰인다.
    savedNotificationDays: parseNotificationDays(user.notification_days),
    isPremium: user.is_premium === 1,
  });
});

/** 프리미엄만 실제로 값을 바꿀 수 있다 — 무료 플랜이 호출하면 402로 막고 업그레이드를 안내한다. */
settings.put('/notification-days', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  if (user.is_premium !== 1) {
    throw new PaymentRequiredError('커스텀 알림 시점은 프리미엄 전용 기능이에요. 무료 플랜은 7/3/1/0일 전으로 고정됩니다.');
  }

  const body = await c.req.json<{ notificationDays?: unknown }>().catch(() => ({}) as { notificationDays?: unknown });
  let days: number[];
  try {
    days = validateNotificationDaysInput(body.notificationDays);
  } catch (err) {
    if (err instanceof InvalidNotificationDaysError) throw new BadRequestError(err.message);
    throw err;
  }

  await c.env.DB.prepare('UPDATE users SET notification_days = ? WHERE id = ?')
    .bind(serializeNotificationDays(days), user.id)
    .run();

  return c.json({ notificationDays: days.sort((a, b) => b - a), isPremium: true });
});

settings.put('/nickname', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ nickname?: unknown }>().catch(() => ({}) as { nickname?: unknown });

  const raw = body.nickname;
  if (typeof raw !== 'string') throw new BadRequestError('닉네임을 입력해주세요.');
  const nickname = raw.trim();
  if (nickname.length === 0 || nickname.length > 20) throw new BadRequestError('닉네임은 1~20자여야 해요.');

  await c.env.DB.prepare('UPDATE users SET nickname = ? WHERE id = ?').bind(nickname, user.id).run();
  return c.json({ nickname });
});

export default settings;

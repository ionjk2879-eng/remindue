// 사용자 설정 — 닉네임 변경, 커스텀 알림 시점 등 계정 단위 설정.
// purchases.ts와 같은 패턴: 이 라우터 전체가 인증 필요.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError } from '../lib/errors';
import {
  effectiveNotificationDays,
  parseNotificationDays,
  serializeNotificationDays,
  validateNotificationDaysInput,
  InvalidNotificationDaysError,
} from '../lib/notification-prefs';
import { generateForwardingToken } from './auth';
import { FX_CARD_BRANDS, FX_CARD_ISSUERS, type FxCardBrand, type FxCardIssuer } from '../lib/fx-card';
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
    notificationDays: effectiveNotificationDays(user.notification_days),
    savedNotificationDays: parseNotificationDays(user.notification_days),
    renewalNotificationDays: effectiveNotificationDays(user.renewal_notification_days),
    savedRenewalNotificationDays: parseNotificationDays(user.renewal_notification_days),
  });
});

settings.put('/notification-days', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));

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

  return c.json({ notificationDays: days.sort((a, b) => b - a) });
});

/** 정기배송·구독 유지 확인의 D-day는 반품/A·S 기한 알림과 별도로 저장한다. */
settings.put('/renewal-notification-days', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ notificationDays?: unknown }>().catch(() => ({}) as { notificationDays?: unknown });
  let days: number[];
  try {
    days = validateNotificationDaysInput(body.notificationDays);
  } catch (err) {
    if (err instanceof InvalidNotificationDaysError) throw new BadRequestError(err.message);
    throw err;
  }
  await c.env.DB.prepare('UPDATE users SET renewal_notification_days = ? WHERE id = ?')
    .bind(serializeNotificationDays(days), user.id)
    .run();
  return c.json({ notificationDays: days.sort((a, b) => b - a) });
});

settings.post('/forwarding-address/regenerate', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  let token = generateForwardingToken();
  let attempts = 0;
  while (attempts < 5) {
    try {
      await c.env.DB.prepare('UPDATE users SET forwarding_token = ? WHERE id = ?').bind(token, user.id).run();
      break;
    } catch {
      token = generateForwardingToken();
      attempts++;
    }
  }
  return c.json({ forwardingEmail: `${token}@${c.env.FORWARDING_EMAIL_DOMAIN}` });
});

/** 온보딩 완료 또는 건너뛰기 — 둘 다 동일하게 다시 안 뜨도록 표시만 한다(단계 구분 없음). */
settings.post('/onboarding-complete', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  await c.env.DB.prepare('UPDATE users SET has_seen_onboarding = 1 WHERE id = ?').bind(user.id).run();
  return c.json({ hasSeenOnboarding: true });
});

/**
 * 해외결제 카드 설정(선택, 무료 포함 전원 사용 가능) — lib/fx-card.ts의 applyCardFee가 이 값으로
 * 카드사·브랜드별 수수료 공식을 적용한다. 미설정(둘 다 null)이면 평균 수수료 근사치로 계산한다.
 */
settings.get('/fx-card', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  return c.json({
    fxCardIssuer: user.fx_card_issuer,
    fxCardBrand: user.fx_card_brand,
  });
});

settings.put('/fx-card', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ fxCardIssuer?: unknown; fxCardBrand?: unknown }>().catch(() => ({}) as { fxCardIssuer?: unknown; fxCardBrand?: unknown });

  const fxCardIssuer = body.fxCardIssuer === null || body.fxCardIssuer === undefined ? null : body.fxCardIssuer;
  const fxCardBrand = body.fxCardBrand === null || body.fxCardBrand === undefined ? null : body.fxCardBrand;
  if (fxCardIssuer !== null && !FX_CARD_ISSUERS.includes(fxCardIssuer as FxCardIssuer)) {
    throw new BadRequestError('fxCardIssuer 값이 올바르지 않습니다');
  }
  if (fxCardBrand !== null && !FX_CARD_BRANDS.includes(fxCardBrand as FxCardBrand)) {
    throw new BadRequestError('fxCardBrand 값이 올바르지 않습니다');
  }

  await c.env.DB.prepare('UPDATE users SET fx_card_issuer = ?, fx_card_brand = ? WHERE id = ?')
    .bind(fxCardIssuer, fxCardBrand, user.id)
    .run();

  return c.json({ fxCardIssuer, fxCardBrand });
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

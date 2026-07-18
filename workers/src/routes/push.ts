import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { BadRequestError } from '../lib/errors';
import type { Env, PushSubscriptionRequestBody, UserRow } from '../types';

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

export default push;

// 이메일(email-intake.ts) 또는 사진 업로드(routes/purchases.ts의 /analyze-image)로 자동
// 추출된 "확인 대기" 항목 조회/처리 API. 사용자가 검토해서 등록/무시를 고른다.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { toPendingPurchaseResponse } from '../lib/mapper';
import { BadRequestError, ForbiddenError } from '../lib/errors';
import type { Env, PendingPurchaseRow, UserRow } from '../types';

const pendingPurchases = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
pendingPurchases.use('*', authMiddleware);

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

async function getOwnedPendingPurchase(db: D1Database, userId: number, id: number): Promise<PendingPurchaseRow> {
  const row = await db.prepare('SELECT * FROM pending_purchases WHERE id = ?').bind(id).first<PendingPurchaseRow>();
  if (!row) {
    throw new BadRequestError(`확인 대기 항목을 찾을 수 없습니다: ${id}`);
  }
  if (row.user_id !== userId) {
    throw new ForbiddenError('본인 소유의 항목만 처리할 수 있습니다');
  }
  return row;
}

async function setStatus(db: D1Database, id: number, status: 'confirmed' | 'ignored'): Promise<void> {
  await db.prepare('UPDATE pending_purchases SET status = ? WHERE id = ?').bind(status, id).run();
}

/** 본인 전용 수신 주소 + status='pending'인 확인 대기 목록(최신순). */
pendingPurchases.get('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM pending_purchases WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC`
  )
    .bind(user.id)
    .all<PendingPurchaseRow>();

  return c.json({
    forwardingEmail: `${user.forwarding_token}@${c.env.FORWARDING_EMAIL_DOMAIN}`,
    items: results.map(toPendingPurchaseResponse),
  });
});

/** 사용자가 폼에서 확인 후 실제 항목(POST /api/purchases)을 등록했다는 걸 표시 — 목록에서 사라진다. */
pendingPurchases.post('/:id/confirm', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPendingPurchase(c.env.DB, user.id, id);

  await setStatus(c.env.DB, id, 'confirmed');
  return c.body(null, 204);
});

/** 스팸/무관한 메일이었거나 등록할 필요가 없다고 판단해 무시 — 목록에서 사라진다. */
pendingPurchases.post('/:id/ignore', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  await getOwnedPendingPurchase(c.env.DB, user.id, id);

  await setStatus(c.env.DB, id, 'ignored');
  return c.body(null, 204);
});

export default pendingPurchases;

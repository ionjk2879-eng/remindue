// 가족/구성원 공유(프리미엄) — 소유자(프리미엄 구독자)가 이메일로 초대하면 shared_access에
// pending 행이 생기고, 초대받은 사람이 그 이메일로 로그인해서 수락하면 accepted로 바뀐다.
// 수락 후에는 초대받은 사람이 소유자의 활성 항목을 읽기 전용으로 볼 수 있다(수정/삭제 불가).
// 별도 초대 토큰/링크 없이 "이메일 일치"만으로 식별하는 단순한 설계 — 아직 가입 전인 이메일도
// 초대해둘 수 있고, 나중에 그 이메일로 가입하면 자동으로 보이게 된다.

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { toPurchaseResponse } from '../lib/mapper';
import { buildShareAcceptedEmailHtml, buildShareInviteEmailHtml, sendDigestEmail } from '../lib/email';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, PaymentRequiredError } from '../lib/errors';
import type { Env, PurchaseRow, SharedAccessResponse, SharedAccessRow, UserRow } from '../types';

const sharing = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
sharing.use('*', authMiddleware);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

async function getInvite(db: D1Database, id: number): Promise<SharedAccessRow> {
  const row = await db.prepare('SELECT * FROM shared_access WHERE id = ?').bind(id).first<SharedAccessRow>();
  if (!row) {
    throw new NotFoundError('초대를 찾을 수 없습니다');
  }
  return row;
}

/** 프리미엄 구독자만 구성원을 초대할 수 있다. */
sharing.post('/invite', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  if (user.is_premium !== 1) {
    throw new PaymentRequiredError('구성원 초대는 프리미엄 전용 기능이에요.');
  }

  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string });
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestError('올바른 이메일 형식이 아닙니다');
  }
  if (email === user.email) {
    throw new BadRequestError('본인을 초대할 수 없습니다');
  }

  try {
    await c.env.DB.prepare('INSERT INTO shared_access (owner_user_id, shared_with_email) VALUES (?, ?)')
      .bind(user.id, email)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE')) {
      throw new ConflictError('이미 이 이메일로 초대를 보냈어요');
    }
    throw err;
  }

  const dashboardUrl = `${c.env.APP_URL}/dashboard`;
  const html = buildShareInviteEmailHtml(email, user.nickname, dashboardUrl);
  await sendDigestEmail(c.env.RESEND_API_KEY, email, `${user.nickname}님이 Remindue 목록을 공유했어요`, html);

  return c.json({ invited: email });
});

/** 내가 소유자로서 보낸 초대 목록 — 상대 이메일과 수락 여부를 보여준다. */
sharing.get('/sent', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM shared_access WHERE owner_user_id = ? ORDER BY created_at DESC'
  )
    .bind(user.id)
    .all<SharedAccessRow>();

  const response: SharedAccessResponse[] = results.map((row) => ({
    id: row.id,
    counterpart: row.shared_with_email,
    status: row.status,
    createdAt: row.created_at,
  }));
  return c.json(response);
});

/** 내가 초대받은(내 이메일로 온) 초대 목록 — 소유자 닉네임을 보여준다. 프리미엄 여부와 무관하게 누구나 볼 수 있다. */
sharing.get('/received', async (c) => {
  const email = c.get('userEmail');
  const { results } = await c.env.DB.prepare(
    `SELECT sa.*, u.nickname AS owner_nickname
       FROM shared_access sa
       JOIN users u ON u.id = sa.owner_user_id
      WHERE sa.shared_with_email = ?
      ORDER BY sa.created_at DESC`
  )
    .bind(email)
    .all<SharedAccessRow & { owner_nickname: string }>();

  const response: SharedAccessResponse[] = results.map((row) => ({
    id: row.id,
    counterpart: row.owner_nickname,
    status: row.status,
    createdAt: row.created_at,
  }));
  return c.json(response);
});

/** 초대받은 사람만 수락할 수 있다 — 자기 이메일로 온 pending 초대만. */
sharing.post('/:id/accept', async (c) => {
  const email = c.get('userEmail');
  const id = Number(c.req.param('id'));
  const invite = await getInvite(c.env.DB, id);

  if (invite.shared_with_email !== email) {
    throw new ForbiddenError('본인에게 온 초대만 수락할 수 있습니다');
  }
  if (invite.status === 'accepted') {
    return c.json({ id: invite.id, status: 'accepted' });
  }

  await c.env.DB.prepare(`UPDATE shared_access SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  const owner = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(invite.owner_user_id).first<UserRow>();
  if (owner) {
    const dashboardUrl = `${c.env.APP_URL}/dashboard`;
    const html = buildShareAcceptedEmailHtml(owner.nickname, email, dashboardUrl);
    await sendDigestEmail(c.env.RESEND_API_KEY, owner.email, '구성원 초대를 수락했어요 — Remindue', html);
  }

  return c.json({ id, status: 'accepted' });
});

/** 초대 취소(소유자) 또는 거절/탈퇴(초대받은 사람) — 둘 중 하나에 해당해야 한다. */
sharing.delete('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const invite = await getInvite(c.env.DB, id);

  const isOwner = invite.owner_user_id === user.id;
  const isInvitee = invite.shared_with_email === user.email;
  if (!isOwner && !isInvitee) {
    throw new ForbiddenError('본인과 관련된 공유만 취소할 수 있습니다');
  }

  await c.env.DB.prepare('DELETE FROM shared_access WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

/** 수락된 공유의 소유자 활성 항목을 읽기 전용으로 조회한다. */
sharing.get('/:id/purchases', async (c) => {
  const email = c.get('userEmail');
  const id = Number(c.req.param('id'));
  const invite = await getInvite(c.env.DB, id);

  if (invite.shared_with_email !== email || invite.status !== 'accepted') {
    throw new ForbiddenError('수락된 공유만 조회할 수 있습니다');
  }

  const { results } = await c.env.DB.prepare('SELECT * FROM purchases WHERE user_id = ? AND archived_at IS NULL')
    .bind(invite.owner_user_id)
    .all<PurchaseRow>();

  const responses = results.map(toPurchaseResponse).sort((a, b) => a.dDay - b.dDay);
  return c.json(responses);
});

export default sharing;

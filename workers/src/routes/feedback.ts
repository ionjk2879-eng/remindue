// 사용자 피드백/문의 게시판 — 전체 공개(다른 사용자 글도 모두 보인다, 커뮤니티처럼 "저도 이
// 기능 원해요" 공감대가 생기도록). 답글은 글쓴이 본인 또는 운영자(Env.ADMIN_EMAIL)만 남길 수
// 있고, 별도의 상태 변경 API 없이 운영자 답글에 실려온 status로만 OPEN → IN_PROGRESS/RESOLVED가
// 바뀐다(명시 안 하면 첫 운영자 답글에서 OPEN → IN_PROGRESS로 자동 전환).

import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { buildAdminFeedbackNotificationEmailHtml, sendDigestEmail } from '../lib/email';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors';
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from '../types';
import type {
  Env,
  FeedbackCategory,
  FeedbackDetailResponse,
  FeedbackListItemResponse,
  FeedbackReplyResponse,
  FeedbackReplyRow,
  FeedbackRow,
  FeedbackStatus,
  UserRow,
} from '../types';

const feedback = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
feedback.use('*', authMiddleware);

async function getUserByEmail(db: D1Database, email: string): Promise<UserRow> {
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!user) {
    throw new BadRequestError(`사용자를 찾을 수 없습니다: ${email}`);
  }
  return user;
}

async function getFeedbackWithAuthor(db: D1Database, id: number): Promise<FeedbackRow & { author_nickname: string }> {
  const row = await db
    .prepare(`SELECT f.*, u.nickname AS author_nickname FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.id = ?`)
    .bind(id)
    .first<FeedbackRow & { author_nickname: string }>();
  if (!row) {
    throw new NotFoundError('문의를 찾을 수 없습니다');
  }
  return row;
}

function validateCategory(value: unknown): FeedbackCategory {
  if (typeof value !== 'string' || !FEEDBACK_CATEGORIES.includes(value as FeedbackCategory)) {
    throw new BadRequestError('category는 BUG/FEATURE_REQUEST/QUESTION/OTHER 중 하나여야 합니다');
  }
  return value as FeedbackCategory;
}

/** 전체 공개 목록 — 최신순, 다른 사용자 글도 모두 보인다. */
feedback.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT f.id, f.category, f.title, f.status, f.created_at, u.nickname AS author_nickname,
            (SELECT COUNT(*) FROM feedback_replies r WHERE r.feedback_id = f.id) AS reply_count
       FROM feedback f
       JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC`
  ).all<{
    id: number;
    category: FeedbackCategory;
    title: string;
    status: FeedbackStatus;
    created_at: string;
    author_nickname: string;
    reply_count: number;
  }>();

  const response: FeedbackListItemResponse[] = results.map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    status: row.status,
    authorNickname: row.author_nickname,
    replyCount: row.reply_count,
    createdAt: row.created_at,
  }));
  return c.json(response);
});

feedback.post('/', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const body = await c.req.json<{ category?: unknown; title?: string; content?: string }>().catch(() => ({}) as never);

  const category = validateCategory(body.category);
  const title = body.title?.trim();
  const content = body.content?.trim();
  if (!title) throw new BadRequestError('title은 필수입니다');
  if (!content) throw new BadRequestError('content는 필수입니다');

  const insert = await c.env.DB.prepare(`INSERT INTO feedback (user_id, category, title, content) VALUES (?, ?, ?, ?)`)
    .bind(user.id, category, title, content)
    .run();
  const id = insert.meta.last_row_id;

  const feedbackUrl = `${c.env.APP_URL}/feedback/${id}`;
  const html = buildAdminFeedbackNotificationEmailHtml(user.nickname, category, title, feedbackUrl);
  await sendDigestEmail(c.env.RESEND_API_KEY, c.env.ADMIN_EMAIL, `[Remindue] 새 문의: ${title}`, html);

  const response: FeedbackDetailResponse = {
    id,
    category,
    title,
    content,
    status: 'OPEN',
    authorNickname: user.nickname,
    isMine: true,
    viewerIsAdmin: user.email === c.env.ADMIN_EMAIL,
    createdAt: new Date().toISOString(),
    replies: [],
  };
  return c.json(response);
});

feedback.get('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const row = await getFeedbackWithAuthor(c.env.DB, id);

  const { results } = await c.env.DB.prepare(`SELECT * FROM feedback_replies WHERE feedback_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<FeedbackReplyRow>();

  const replies: FeedbackReplyResponse[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
  }));

  const response: FeedbackDetailResponse = {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    status: row.status,
    authorNickname: row.author_nickname,
    isMine: user.id === row.user_id,
    viewerIsAdmin: user.email === c.env.ADMIN_EMAIL,
    createdAt: row.created_at,
    replies,
  };
  return c.json(response);
});

/** 수정 — 글쓴이 본인만. status는 건드리지 않는다(내용 수정일 뿐 처리 상태 재개가 아니다). */
feedback.put('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const row = await getFeedbackWithAuthor(c.env.DB, id);

  if (user.id !== row.user_id) {
    throw new ForbiddenError('작성자 본인만 수정할 수 있습니다');
  }

  const body = await c.req.json<{ category?: unknown; title?: string; content?: string }>().catch(() => ({}) as never);
  const category = validateCategory(body.category);
  const title = body.title?.trim();
  const content = body.content?.trim();
  if (!title) throw new BadRequestError('title은 필수입니다');
  if (!content) throw new BadRequestError('content는 필수입니다');

  await c.env.DB.prepare('UPDATE feedback SET category = ?, title = ?, content = ? WHERE id = ?')
    .bind(category, title, content, id)
    .run();

  const { results } = await c.env.DB.prepare(`SELECT * FROM feedback_replies WHERE feedback_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<FeedbackReplyRow>();
  const replies: FeedbackReplyResponse[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
  }));

  const response: FeedbackDetailResponse = {
    id,
    category,
    title,
    content,
    status: row.status,
    authorNickname: row.author_nickname,
    isMine: true,
    viewerIsAdmin: user.email === c.env.ADMIN_EMAIL,
    createdAt: row.created_at,
    replies,
  };
  return c.json(response);
});

/** 삭제 — 글쓴이 본인 또는 운영자(모더레이션). 답글은 FK ON DELETE CASCADE로 함께 지워진다. */
feedback.delete('/:id', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const row = await getFeedbackWithAuthor(c.env.DB, id);

  const isAdmin = user.email === c.env.ADMIN_EMAIL;
  const isAuthor = user.id === row.user_id;
  if (!isAdmin && !isAuthor) {
    throw new ForbiddenError('작성자 본인 또는 운영자만 삭제할 수 있습니다');
  }

  await c.env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

/**
 * 답글 작성 — 글쓴이 본인 또는 운영자만. 운영자는 status를 함께 실어 보내 상태를 바꿀 수 있고
 * (별도의 상태 변경 API는 없다), 아무 status도 안 실었는데 아직 OPEN이면 "답변이 시작됐다"는
 * 신호로 자동으로 IN_PROGRESS로 넘어간다.
 */
feedback.post('/:id/replies', async (c) => {
  const user = await getUserByEmail(c.env.DB, c.get('userEmail'));
  const id = Number(c.req.param('id'));
  const row = await getFeedbackWithAuthor(c.env.DB, id);

  const isAdmin = user.email === c.env.ADMIN_EMAIL;
  const isAuthor = user.id === row.user_id;
  if (!isAdmin && !isAuthor) {
    throw new ForbiddenError('작성자 본인 또는 운영자만 답글을 남길 수 있습니다');
  }

  const body = await c.req.json<{ content?: string; status?: unknown }>().catch(() => ({}) as never);
  const content = body.content?.trim();
  if (!content) throw new BadRequestError('content는 필수입니다');

  await c.env.DB.prepare(`INSERT INTO feedback_replies (feedback_id, content, is_admin) VALUES (?, ?, ?)`)
    .bind(id, content, isAdmin ? 1 : 0)
    .run();

  if (isAdmin) {
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !FEEDBACK_STATUSES.includes(body.status as FeedbackStatus)) {
        throw new BadRequestError('status는 OPEN/IN_PROGRESS/RESOLVED 중 하나여야 합니다');
      }
      await c.env.DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(body.status, id).run();
    } else if (row.status === 'OPEN') {
      await c.env.DB.prepare(`UPDATE feedback SET status = 'IN_PROGRESS' WHERE id = ?`).bind(id).run();
    }
  }

  const updated = await getFeedbackWithAuthor(c.env.DB, id);
  const { results } = await c.env.DB.prepare(`SELECT * FROM feedback_replies WHERE feedback_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<FeedbackReplyRow>();

  const replies: FeedbackReplyResponse[] = results.map((r) => ({
    id: r.id,
    content: r.content,
    isAdmin: r.is_admin === 1,
    createdAt: r.created_at,
  }));

  const response: FeedbackDetailResponse = {
    id: updated.id,
    category: updated.category,
    title: updated.title,
    content: updated.content,
    status: updated.status,
    authorNickname: updated.author_nickname,
    isMine: user.id === updated.user_id,
    viewerIsAdmin: isAdmin,
    createdAt: updated.created_at,
    replies,
  };
  return c.json(response);
});

export default feedback;

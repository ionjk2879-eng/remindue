import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import purchaseRoutes from '../src/routes/purchases';
import sharingRoutes from '../src/routes/sharing';
import fxRecalculationRoutes from '../src/routes/fx-recalculation';
import { HttpError } from '../src/lib/errors';
import { signJwt } from '../src/lib/jwt';
import type { Env } from '../src/types';
import { createIntegrationD1, type IntegrationD1 } from './integration-d1';

const JWT_SECRET = 'integration-test-secret';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/purchases', purchaseRoutes);
  app.route('/api/sharing', sharingRoutes);
  app.route('/api/fx-recalculation', fxRecalculationRoutes);
  app.onError((error, context) => {
    if (error instanceof HttpError) return context.json({ message: error.message }, error.status as never);
    throw error;
  });
  return app;
}

function testEnv(db: IntegrationD1): Env {
  return {
    DB: db as unknown as D1Database,
    JWT_SECRET,
    APP_URL: 'https://dev.example.com',
    ENVIRONMENT: 'development',
  } as Env;
}

function seedUser(db: IntegrationD1, email: string, premium = false): number {
  const result = db.raw.prepare(
    'INSERT INTO users (email, password_hash, nickname, is_premium) VALUES (?, ?, ?, ?)'
  ).run(email, 'hash', email.split('@')[0], premium ? 1 : 0);
  return Number(result.lastInsertRowid);
}

function seedPurchase(
  db: IntegrationD1,
  userId: number,
  itemName: string,
  overrides: Partial<{ type: string; baseDate: string; returnDays: number | null; archivedAt: string | null; discardedAt: string | null; discontinuedAt: string | null }> = {}
) {
  const values = {
    type: 'GENERAL',
    baseDate: '2026-08-03',
    returnDays: 7,
    archivedAt: null,
    discardedAt: null,
    discontinuedAt: null,
    ...overrides,
  };
  db.raw.prepare(
    `INSERT INTO purchases
      (user_id, type, item_name, base_date, amount, return_deadline_days, archived_at, discarded_at, discontinued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, values.type, itemName, values.baseDate, 10000, values.returnDays, values.archivedAt, values.discardedAt, values.discontinuedAt);
}

async function authorizedRequest(email: string, path: string, init?: RequestInit): Promise<Request> {
  const token = await signJwt(email, JWT_SECRET, 3600);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  return new Request(`https://test.example.com${path}`, { ...init, headers });
}

describe('Worker route integration', () => {
  let db: IntegrationD1;
  const app = createApp();

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-03T03:00:00.000Z'));
    db = createIntegrationD1();
  });

  afterEach(() => {
    db.raw.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects an unauthenticated purchases request', async () => {
    const response = await app.fetch(new Request('https://test.example.com/api/purchases'), testEnv(db));
    expect(response.status).toBe(401);
  });

  it('lets any user invite a member', async () => {
    seedUser(db, 'free@example.com');
    const request = await authorizedRequest('free@example.com', '/api/sharing/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'member@example.com' }),
    });
    const response = await app.fetch(request, testEnv(db));
    expect(response.status).toBe(200);
  });

  it('returns only the owner active items in an accepted shared list', async () => {
    const ownerId = seedUser(db, 'owner@example.com', true);
    seedUser(db, 'member@example.com');
    seedPurchase(db, ownerId, 'active');
    seedPurchase(db, ownerId, 'past', { baseDate: '2026-06-01' });
    seedPurchase(db, ownerId, 'archived', { archivedAt: '2026-08-01 00:00:00' });
    seedPurchase(db, ownerId, 'discarded', { discardedAt: '2026-08-01 00:00:00' });
    seedPurchase(db, ownerId, 'stopped subscription', {
      type: 'SUBSCRIPTION', returnDays: null, discontinuedAt: '2026-08-01 00:00:00',
    });
    const invite = db.raw.prepare(
      `INSERT INTO shared_access (owner_user_id, shared_with_email, status, accepted_at)
       VALUES (?, ?, 'accepted', datetime('now'))`
    ).run(ownerId, 'member@example.com');

    const request = await authorizedRequest('member@example.com', `/api/sharing/${invite.lastInsertRowid}/purchases`);
    const response = await app.fetch(request, testEnv(db));
    expect(response.status).toBe(200);
    const body = await response.json<Array<{ itemName: string }>>();
    expect(body.map((item) => item.itemName)).toEqual(['active']);
  });

  it('allows registering past the old five-item free-plan limit', async () => {
    const userId = seedUser(db, 'free@example.com');
    for (let index = 0; index < 5; index += 1) seedPurchase(db, userId, `item-${index}`);

    const request = await authorizedRequest('free@example.com', '/api/purchases', {
      method: 'POST',
      body: JSON.stringify({ type: 'GENERAL', itemName: 'sixth item', baseDate: '2026-08-03', returnDeadlineDays: 7 }),
    });
    const response = await app.fetch(request, testEnv(db));
    expect(response.status).toBe(200);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM purchases WHERE user_id = ?').bind(userId).first<number>('count')).toBe(6);
  });

  it('links round numbering to a past item when linkedPastPurchaseId is a valid past match', async () => {
    const userId = seedUser(db, 'resub@example.com');
    const pastId = db.raw.prepare(
      `INSERT INTO purchases
        (user_id, type, item_name, base_date, amount, schedule_type, interval_days, discontinued_at, discontinued_round)
       VALUES (?, 'SUBSCRIPTION', 'Claude Pro', '2026-01-01', 20000, 'INTERVAL', 30, '2026-06-01 00:00:00', 5)`
    ).run(userId).lastInsertRowid;

    const request = await authorizedRequest('resub@example.com', '/api/purchases', {
      method: 'POST',
      body: JSON.stringify({
        type: 'SUBSCRIPTION', itemName: 'Claude Pro', baseDate: '2026-08-03',
        scheduleType: 'INTERVAL', intervalDays: 30, linkedPastPurchaseId: Number(pastId),
      }),
    });
    const response = await app.fetch(request, testEnv(db));
    expect(response.status).toBe(200);
    const created = await response.json<{ deliveryRound: number | null }>();
    // 지난 항목이 5회차에서 멈췄으니 새 항목은 6회차부터 이어진다.
    expect(created.deliveryRound).toBe(6);
  });

  it('links round numbering to a past item via PUT (edit) too, overriding the normal round-preserving offset', async () => {
    const userId = seedUser(db, 'resub3@example.com');
    const pastId = db.raw.prepare(
      `INSERT INTO purchases
        (user_id, type, item_name, base_date, amount, schedule_type, fixed_day_of_month, fixed_day_interval_months, discarded_at)
       VALUES (?, 'SUBSCRIPTION', '네이버플러스 월간 이용권', '2026-07-09', 5000, 'FIXED_DAY', 9, 1, '2026-08-07 12:49:28')`
    ).run(userId).lastInsertRowid;
    const editedId = db.raw.prepare(
      `INSERT INTO purchases
        (user_id, type, item_name, base_date, amount, schedule_type, fixed_day_of_month, fixed_day_interval_months)
       VALUES (?, 'SUBSCRIPTION', '네이버플러스 월간 이용권', '2026-08-18', 5000, 'FIXED_DAY', 18, 1)`
    ).run(userId).lastInsertRowid;

    const request = await authorizedRequest('resub3@example.com', `/api/purchases/${editedId}`, {
      method: 'PUT',
      body: JSON.stringify({
        type: 'SUBSCRIPTION', itemName: '네이버플러스 월간 이용권', baseDate: '2026-08-18',
        scheduleType: 'FIXED_DAY', fixedDayOfMonth: 18, fixedDayIntervalMonths: 1,
        linkedPastPurchaseId: Number(pastId),
      }),
    });
    const response = await app.fetch(request, testEnv(db));
    expect(response.status).toBe(200);
    const updated = await response.json<{ deliveryRound: number | null }>();
    // 삭제 시점(8/7) 기준 지난 항목은 2회차까지였다 — 새 항목은 3회차부터 이어진다.
    expect(updated.deliveryRound).toBe(3);
  });

  it('ignores linkedPastPurchaseId when it does not belong to the user (no round offset applied)', async () => {
    const otherUserId = seedUser(db, 'owner2@example.com');
    seedUser(db, 'resub2@example.com');
    const otherUsersPastId = db.raw.prepare(
      `INSERT INTO purchases
        (user_id, type, item_name, base_date, amount, schedule_type, interval_days, discontinued_at, discontinued_round)
       VALUES (?, 'SUBSCRIPTION', 'Naver Plus', '2026-01-01', 5000, 'INTERVAL', 30, '2026-06-01 00:00:00', 3)`
    ).run(otherUserId).lastInsertRowid;

    const request = await authorizedRequest('resub2@example.com', '/api/purchases', {
      method: 'POST',
      body: JSON.stringify({
        type: 'SUBSCRIPTION', itemName: 'Naver Plus', baseDate: '2026-08-03',
        scheduleType: 'INTERVAL', intervalDays: 30, linkedPastPurchaseId: Number(otherUsersPastId),
      }),
    });
    const response = await app.fetch(request, testEnv(db));
    expect(response.status).toBe(200);
    const created = await response.json<{ deliveryRound: number | null }>();
    expect(created.deliveryRound).toBe(1);
  });

  it('previews and applies legacy foreign-payment recalculation with audit evidence', async () => {
    const userId = seedUser(db, 'fx@example.com');
    seedPurchase(db, userId, 'legacy USD purchase', { baseDate: '2026-07-01' });
    db.raw.prepare(
      `UPDATE purchases SET original_amount = 10, original_currency = 'USD', exchange_rate = 1000 WHERE user_id = ?`
    ).run(userId);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ rate: 1400 }]), { status: 200 })));

    const previewRequest = await authorizedRequest('fx@example.com', '/api/fx-recalculation/preview', { method: 'POST' });
    const previewResponse = await app.fetch(previewRequest, testEnv(db));
    expect(previewResponse.status).toBe(201);
    const preview = await previewResponse.json<{ id: number; readyCount: number; items: Array<{ beforeAmount: number; proposedAmount: number; rateSource: string; formulaVersion: string }> }>();
    expect(preview.readyCount).toBe(1);
    expect(preview.items[0]).toMatchObject({ beforeAmount: 10000, proposedAmount: 14350, rateSource: 'FRANKFURTER', formulaVersion: 'fx-v2' });

    const applyRequest = await authorizedRequest('fx@example.com', `/api/fx-recalculation/${preview.id}/apply`, { method: 'POST' });
    const applyResponse = await app.fetch(applyRequest, testEnv(db));
    expect(applyResponse.status).toBe(200);
    expect(await db.prepare('SELECT amount FROM purchases WHERE user_id = ?').bind(userId).first<number>('amount')).toBe(14350);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM fx_calculation_history').first<number>('count')).toBe(1);
  });
});

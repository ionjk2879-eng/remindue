// 실제 돈이 오가는 정기결제 갱신/만료 로직(billing-renewal.ts)에 대한 테스트.
// 재시도 횟수 집계, 3회 실패 시 강제 해지, 토스/카카오페이 분기, 만료 스윕의 유예기간 처리처럼
// 실제 버그가 났을 때 매출/구독 상태가 잘못될 수 있는 부분을 실제 SQLite(fake-d1) 위에서 검증한다.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeD1, seedSubscription, seedUser, type FakeD1 } from './fake-d1';

vi.mock('../src/lib/toss', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/toss')>('../src/lib/toss');
  return { ...actual, chargeBillingKey: vi.fn() };
});
vi.mock('../src/lib/kakaopay', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/kakaopay')>('../src/lib/kakaopay');
  return { ...actual, chargeSubscription: vi.fn() };
});
vi.mock('../src/lib/email', () => ({
  sendDigestEmail: vi.fn().mockResolvedValue(undefined),
  buildRenewalFailedEmailHtml: vi.fn().mockReturnValue('<html></html>'),
}));

import { chargeBillingKey, TossApiError } from '../src/lib/toss';
import { chargeSubscription } from '../src/lib/kakaopay';
import { KAKAO_CHARGE_ITEM_NAME } from '../src/lib/billing-plans';
import { runBillingRenewals, runPremiumExpirySweep } from '../src/lib/billing-renewal';

const PAST_DUE_DATE = '2020-01-01 00:00:00'; // 항상 "만료 하루 전" 조건을 만족하는 고정 과거 시각
const FUTURE_DATE = '2099-01-01 00:00:00';

function makeEnv(db: FakeD1) {
  return {
    DB: db as unknown as D1Database,
    APP_URL: 'https://remindue.kr',
    TOSS_SECRET_KEY: 'test_sk_dummy',
    KAKAOPAY_SECRET_KEY: 'test_kakao_dummy',
    KAKAOPAY_SUBSCRIPTION_CID: 'TCSUBSCRIP',
    RESEND_API_KEY: 'test_resend_dummy',
  } as never;
}

describe('runBillingRenewals', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = createFakeD1();
    vi.mocked(chargeBillingKey).mockReset();
    vi.mocked(chargeSubscription).mockReset();
  });

  it('토스 정기결제가 성공하면 다음 주기로 연장하고 프리미엄을 유지한다', async () => {
    const userId = seedUser(db, { premium_expires_at: PAST_DUE_DATE });
    const subId = seedSubscription(db, userId, { plan: 'MONTHLY', current_period_end: PAST_DUE_DATE });
    vi.mocked(chargeBillingKey).mockResolvedValue({
      paymentKey: 'pk_1', orderId: 'x', status: 'DONE', totalAmount: 1900, approvedAt: '2026-01-01',
    });

    const result = await runBillingRenewals(makeEnv(db));

    expect(result).toEqual({ attempted: 1, renewed: 1, failed: 0, downgraded: 0 });
    const sub = db.raw.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as never as {
      current_period_end: string; failed_charge_count: number; status: string; auto_renew: number;
    };
    expect(sub.current_period_end > PAST_DUE_DATE).toBe(true); // datetime(+1 month)만큼 미래로 이동
    expect(sub.failed_charge_count).toBe(0);
    expect(sub.status).toBe('ACTIVE');
    const user = db.raw.prepare('SELECT * FROM users WHERE id = ?').get(userId) as never as {
      is_premium: number; premium_expires_at: string;
    };
    expect(user.is_premium).toBe(1);
    expect(user.premium_expires_at).toBe(sub.current_period_end);
    const payment = db.raw.prepare('SELECT * FROM payments WHERE subscription_id = ?').get(subId) as never as {
      status: string; pg_provider: string;
    };
    expect(payment.status).toBe('CONFIRMED');
    expect(payment.pg_provider).toBe('TOSS');
  });

  it('결제가 실패하면 실패 횟수만 늘리고 3회 미만이면 구독을 유지한다', async () => {
    const userId = seedUser(db);
    const subId = seedSubscription(db, userId, { current_period_end: PAST_DUE_DATE, failed_charge_count: 1 });
    vi.mocked(chargeBillingKey).mockRejectedValue(new TossApiError('카드 한도를 초과했습니다', 'EXCEED_MAX_DAILY_PAYMENT_COUNT', 400));

    const result = await runBillingRenewals(makeEnv(db));

    expect(result).toEqual({ attempted: 1, renewed: 0, failed: 1, downgraded: 0 });
    const sub = db.raw.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as never as {
      failed_charge_count: number; status: string; auto_renew: number;
    };
    expect(sub.failed_charge_count).toBe(2);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.auto_renew).toBe(1);
    const payment = db.raw.prepare('SELECT * FROM payments WHERE subscription_id = ?').get(subId) as never as {
      status: string; failure_reason: string;
    };
    expect(payment.status).toBe('FAILED');
    expect(payment.failure_reason).toBe('카드 한도를 초과했습니다');
  });

  it('3번째 연속 실패에서는 자동갱신을 끄고 구독을 PAST_DUE로 내린다', async () => {
    const userId = seedUser(db);
    const subId = seedSubscription(db, userId, { current_period_end: PAST_DUE_DATE, failed_charge_count: 2 });
    vi.mocked(chargeBillingKey).mockRejectedValue(new TossApiError('한도 초과', undefined, 400));

    const result = await runBillingRenewals(makeEnv(db));

    expect(result).toEqual({ attempted: 1, renewed: 0, failed: 1, downgraded: 1 });
    const sub = db.raw.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as never as {
      failed_charge_count: number; status: string; auto_renew: number;
    };
    expect(sub.failed_charge_count).toBe(3);
    expect(sub.status).toBe('PAST_DUE');
    expect(sub.auto_renew).toBe(0);
  });

  it('카카오페이 구독은 chargeSubscription을 영문 item_name으로 호출한다', async () => {
    const userId = seedUser(db, { toss_customer_key: null });
    seedSubscription(db, userId, {
      plan: 'MONTHLY', current_period_end: PAST_DUE_DATE, toss_billing_key: null, kakao_sid: 'sid-123',
    });
    vi.mocked(chargeSubscription).mockResolvedValue({
      aid: 'a', tid: 'tid-1', cid: 'TCSUBSCRIP', sid: 'sid-123', amount: { total: 1900 }, approved_at: '2026-01-01',
    });

    const result = await runBillingRenewals(makeEnv(db));

    expect(result.renewed).toBe(1);
    expect(chargeSubscription).toHaveBeenCalledWith(
      'test_kakao_dummy',
      expect.objectContaining({ sid: 'sid-123', itemName: KAKAO_CHARGE_ITEM_NAME.MONTHLY })
    );
    expect(chargeBillingKey).not.toHaveBeenCalled();
  });

  it('연간 정기결제는 재청구하지 않고 자동갱신을 해지한다', async () => {
    const userId = seedUser(db, { toss_customer_key: null });
    const subId = seedSubscription(db, userId, {
      plan: 'ANNUAL', current_period_end: PAST_DUE_DATE, toss_billing_key: null, kakao_sid: 'sid-annual',
    });

    const result = await runBillingRenewals(makeEnv(db));

    expect(result).toEqual({ attempted: 1, renewed: 0, failed: 0, downgraded: 1 });
    expect(chargeSubscription).not.toHaveBeenCalled();
    expect(chargeBillingKey).not.toHaveBeenCalled();
    const sub = db.raw.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subId) as never as {
      status: string; auto_renew: number;
    };
    expect(sub.status).toBe('CANCELED');
    expect(sub.auto_renew).toBe(0);
  });

  it('토스 빌링키/고객키가 없는 정합성 깨진 행은 건너뛰고 크래시하지 않는다', async () => {
    const userId = seedUser(db, { toss_customer_key: null });
    seedSubscription(db, userId, { current_period_end: PAST_DUE_DATE, toss_billing_key: null, kakao_sid: null });

    const result = await runBillingRenewals(makeEnv(db));

    expect(result).toEqual({ attempted: 1, renewed: 0, failed: 0, downgraded: 0 });
    expect(chargeBillingKey).not.toHaveBeenCalled();
    const payments = db.raw.prepare('SELECT * FROM payments').all();
    expect(payments).toHaveLength(0);
  });

  it('만료가 아직 먼 구독은 갱신 대상에 포함하지 않는다', async () => {
    const userId = seedUser(db);
    seedSubscription(db, userId, { current_period_end: FUTURE_DATE });

    const result = await runBillingRenewals(makeEnv(db));

    expect(result).toEqual({ attempted: 0, renewed: 0, failed: 0, downgraded: 0 });
  });
});

describe('runPremiumExpirySweep', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = createFakeD1();
  });

  it('만료됐고 재시도 중인 정기결제가 없는 사용자는 프리미엄을 내린다', async () => {
    const userId = seedUser(db, { is_premium: 1, premium_expires_at: PAST_DUE_DATE });

    const result = await runPremiumExpirySweep(makeEnv(db));

    expect(result.demoted).toBe(1);
    const user = db.raw.prepare('SELECT is_premium FROM users WHERE id = ?').get(userId) as never as { is_premium: number };
    expect(user.is_premium).toBe(0);
  });

  it('만료됐어도 자동갱신 재시도 중(ACTIVE+auto_renew)인 사용자는 내리지 않는다', async () => {
    const userId = seedUser(db, { is_premium: 1, premium_expires_at: PAST_DUE_DATE });
    seedSubscription(db, userId, { status: 'ACTIVE', auto_renew: 1, current_period_end: PAST_DUE_DATE, failed_charge_count: 1 });

    const result = await runPremiumExpirySweep(makeEnv(db));

    expect(result.demoted).toBe(0);
    const user = db.raw.prepare('SELECT is_premium FROM users WHERE id = ?').get(userId) as never as { is_premium: number };
    expect(user.is_premium).toBe(1);
  });

  it('아직 만료되지 않은 사용자는 건드리지 않는다', async () => {
    seedUser(db, { is_premium: 1, premium_expires_at: FUTURE_DATE });

    const result = await runPremiumExpirySweep(makeEnv(db));

    expect(result.demoted).toBe(0);
  });

  it('premium_expires_at이 NULL인 계정(수동 프리미엄 부여)은 건드리지 않는다', async () => {
    seedUser(db, { is_premium: 1, premium_expires_at: null });

    const result = await runPremiumExpirySweep(makeEnv(db));

    expect(result.demoted).toBe(0);
  });
});

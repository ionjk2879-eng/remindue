import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./email', () => ({ sendDigestEmail: vi.fn() }));

import { sendDigestEmail } from './email';
import { notifyCronFailure } from './cron-alert';

const env = { RESEND_API_KEY: 'key', ADMIN_EMAIL: 'admin@example.com' } as never;

describe('notifyCronFailure', () => {
  beforeEach(() => {
    vi.mocked(sendDigestEmail).mockReset();
  });

  it('실패한 작업 이름과 에러 메시지를 관리자 메일로 보낸다', async () => {
    vi.mocked(sendDigestEmail).mockResolvedValue({ sent: true });

    await notifyCronFailure(env, 'billing-renewal', new Error('D1 unavailable'));

    expect(sendDigestEmail).toHaveBeenCalledWith(
      'key',
      'admin@example.com',
      expect.stringContaining('billing-renewal'),
      expect.stringContaining('D1 unavailable')
    );
  });

  it('Error가 아닌 값(문자열 throw 등)도 메시지로 변환해서 보낸다', async () => {
    vi.mocked(sendDigestEmail).mockResolvedValue({ sent: true });

    await notifyCronFailure(env, 'weekly-digest', 'plain string failure');

    expect(sendDigestEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.stringContaining('plain string failure')
    );
  });

  it('알림 메일 발송 자체가 실패해도 다시 던지지 않는다', async () => {
    vi.mocked(sendDigestEmail).mockRejectedValue(new Error('Resend down'));

    await expect(notifyCronFailure(env, 'daily-digest', new Error('boom'))).resolves.toBeUndefined();
  });

  it('HTML에 들어가는 에러 메시지의 특수문자를 이스케이프한다', async () => {
    vi.mocked(sendDigestEmail).mockResolvedValue({ sent: true });

    await notifyCronFailure(env, 'arrival-confirm', new Error('<script>alert(1)</script>'));

    const html = vi.mocked(sendDigestEmail).mock.calls[0][3];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

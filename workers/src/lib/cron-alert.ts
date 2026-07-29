// 크론 작업(정기결제 갱신, 다이제스트 등)이 실패하면 Cloudflare Workers 로그에만 조용히 묻혀서
// 아무도 모르고 지나가기 쉽다 — index.ts의 scheduled()가 각 ctx.waitUntil(...) 체인 끝에 이 함수를
// .catch()로 붙여서, 실패를 구조화 로그로 남기는 것과 별개로 관리자 이메일로도 알린다.

import { sendDigestEmail } from './email';
import { logger } from './logger';
import type { Env } from '../types';

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function notifyCronFailure(env: Env, jobName: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('cron.job_failed', { job: jobName, error: message });

  const html = `
    <p><strong>${escapeHtml(jobName)}</strong> 크론 작업이 실패했습니다.</p>
    <pre style="white-space: pre-wrap; background:#f5f5f0; padding:12px; border-radius:8px;">${escapeHtml(message)}</pre>
  `;

  // 알림 메일 발송 자체가 실패해도(Resend 장애 등) 여기서 또 던지면 안 된다 — 최소한 위 로그는
  // 이미 남았으니, 여기서는 그 사실만 추가로 기록하고 삼킨다.
  await sendDigestEmail(env.RESEND_API_KEY, env.ADMIN_EMAIL, `[Remindue] ${jobName} 크론 실패`, html).catch((err) => {
    logger.error('cron.alert_email_failed', { job: jobName, error: err instanceof Error ? err.message : String(err) });
  });
}

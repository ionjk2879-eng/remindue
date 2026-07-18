// D-day 다이제스트 이메일 — 발송은 Resend REST API를 fetch로 직접 호출한다(SDK 의존성 없이).
// 도메인 인증 전에도 바로 테스트할 수 있도록 발신 주소는 Resend의 sandbox 주소를 기본값으로 쓴다 —
// 실제 도메인을 Resend에 등록하면 이 상수만 바꾸면 된다.

import type { PurchaseType } from '../types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Remindue <onboarding@resend.dev>';

const TYPE_SHORT_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '전자제품',
  ONLINE_ORDER: '온라인주문',
  RECURRING_DELIVERY: '정기배송',
};

export interface DigestItem {
  itemName: string;
  type: PurchaseType;
  dDay: number;
  deadline: string;
}

export function formatDDay(dDay: number): string {
  return dDay === 0 ? 'D-DAY' : `D-${dDay}`;
}

/** dDay<=3은 긴급(레드), 그 외(=7)는 임박(앰버) — 프론트 StampBadge 색 구간과 동일한 기준. */
function dDayColor(dDay: number): string {
  return dDay <= 3 ? '#C13B3B' : '#B8862E';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 이메일 클라이언트 호환성 때문에 <style> 블록 대신 인라인 스타일만 쓴다.
 * 폰트도 웹폰트 로드가 보장되지 않으니 안전한 폴백 스택으로 대체(모노는 Courier New, 본문은 시스템 산세리프).
 */
export function buildDigestEmailHtml(nickname: string, items: DigestItem[], dashboardUrl: string): string {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #E2E0D6;font-size:14px;color:#1F2937;font-weight:700;">
            ${escapeHtml(item.itemName)}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #E2E0D6;font-size:12px;color:#6B7280;white-space:nowrap;">
            ${TYPE_SHORT_LABEL[item.type]}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #E2E0D6;font-size:13px;font-weight:800;color:${dDayColor(item.dDay)};font-family:'Courier New',Courier,monospace;white-space:nowrap;">
            ${formatDDay(item.dDay)}
          </td>
          <td style="padding:10px 8px;border-bottom:1px solid #E2E0D6;font-size:13px;color:#1F2937;font-family:'Courier New',Courier,monospace;white-space:nowrap;">
            ${escapeHtml(item.deadline)}
          </td>
        </tr>`
    )
    .join('');

  return `
<!doctype html>
<html lang="ko">
  <body style="margin:0;padding:0;background-color:#F5F5F0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#FFFFFF;border:1px solid #E2E0D6;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 0;">
                <span style="font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;color:#1F2937;">Remindue</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 4px;">
                <h1 style="margin:0;font-size:19px;line-height:1.4;color:#1F2937;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
                  ${escapeHtml(nickname)}님, 오늘 챙길 게 <span style="color:#C13B3B;">${items.length}건</span> 있어요
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 20px;">
                <p style="margin:0;font-size:13px;color:#6B7280;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
                  기한이 7일/3일/1일/오늘(D-DAY)로 다가온 항목이에요.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">항목명</td>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">종류</td>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">D-day</td>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">기한</td>
                  </tr>
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 28px 32px;">
                <a href="${dashboardUrl}" style="display:inline-block;background-color:#1F2937;color:#F5F5F0;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
                  대시보드에서 확인하기
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Resend REST API로 다이제스트 메일 1통을 보낸다.
 * API 키가 비어 있으면(로컬 개발 등) 실제 전송은 건너뛰고 콘솔에만 남긴다 —
 * 키를 넣는 순간 코드 변경 없이 바로 발송이 시작된다.
 */
export async function sendDigestEmail(
  apiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<{ sent: boolean }> {
  if (!apiKey) {
    console.warn(`[digest-email] RESEND_API_KEY가 없어 발송을 건너뜁니다 (수신자: ${to}, 제목: ${subject})`);
    return { sent: false };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[digest-email] Resend 발송 실패 (${res.status}): ${body}`);
    return { sent: false };
  }

  return { sent: true };
}

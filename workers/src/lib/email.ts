// D-day 다이제스트 이메일 — 발송은 Resend REST API를 fetch로 직접 호출한다(SDK 의존성 없이).
// 도메인 인증 전에도 바로 테스트할 수 있도록 발신 주소는 Resend의 sandbox 주소를 기본값으로 쓴다 —
// 실제 도메인을 Resend에 등록하면 이 상수만 바꾸면 된다.

import type { PurchaseType } from '../types';
import { buildDigestTitle, buildItemClause, formatDDay, type DigestItem } from './messages';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Remindue <onboarding@resend.dev>';

const TYPE_SHORT_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '전자제품',
  ONLINE_ORDER: '온라인주문',
  RECURRING_DELIVERY: '정기배송',
};

export type { DigestItem };
export { formatDDay };

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
            <div style="margin-top:2px;font-size:12px;font-weight:400;color:${dDayColor(item.dDay)};">
              ${escapeHtml(buildItemClause(item))}
            </div>
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
                  ${escapeHtml(nickname)}님, <span style="color:#C13B3B;">${escapeHtml(buildDigestTitle(items))}</span>
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

export interface WeeklyItem {
  itemName: string;
  dDay: number;
  deadline: string;
}

/**
 * 정기배송 전용 주간 리포트 이메일 — D-day 다이제스트(buildDigestEmailHtml)와 별개로,
 * 이번 주(7일 이내) 배송 예정 항목만 모아 보여준다. upcoming이 비어 있으면 이 함수는
 * 호출하지 않는다고 가정한다(weekly-digest.ts가 빈 버킷은 애초에 만들지 않음).
 */
export function buildWeeklyDigestEmailHtml(nickname: string, upcoming: WeeklyItem[], dashboardUrl: string): string {
  const upcomingRows = upcoming
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #E2E0D6;font-size:14px;color:#1F2937;font-weight:700;">
            ${escapeHtml(item.itemName)}
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

  const upcomingSection = upcoming.length
    ? `
            <tr>
              <td style="padding:20px 28px 4px;">
                <h2 style="margin:0;font-size:15px;color:#1F2937;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">📦 이번 주 배송 예정 <span style="color:#B8862E;">${upcoming.length}건</span></h2>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">항목명</td>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">D-day</td>
                    <td style="padding:0 8px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;border-bottom:1.5px solid #1F2937;">배송일</td>
                  </tr>
                  ${upcomingRows}
                </table>
              </td>
            </tr>`
    : '';

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
                  ${escapeHtml(nickname)}님, 이번 주 정기배송 리포트예요
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 20px;">
                <p style="margin:0;font-size:13px;color:#6B7280;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
                  D-day 알림과는 별개로, 정기배송 항목만 모아 매주 한 번 보내드려요.
                </p>
              </td>
            </tr>
            ${upcomingSection}
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
 * 제목 한 줄(강조색 span 포함) + 본문 한 단락 + CTA 버튼 하나짜리 단순 알림 메일의 공통 뼈대.
 * buildDigestEmailHtml/buildWeeklyDigestEmailHtml처럼 표가 필요한 메일은 이 헬퍼를 안 쓰고
 * 직접 조립하지만, 정기결제 실패/공유 초대처럼 "문장 하나 전달"이 전부인 메일은 이걸 재사용한다.
 */
function buildSimpleEmailHtml(params: {
  nickname: string;
  headingPlain: string;
  headingHighlight: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const { nickname, headingPlain, headingHighlight, message, ctaLabel, ctaUrl } = params;
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
                  ${escapeHtml(nickname)}님, ${headingPlain}<span style="color:#C13B3B;">${headingHighlight}</span>
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 24px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#1F2937;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
                  ${message}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 28px 32px;">
                <a href="${ctaUrl}" style="display:inline-block;background-color:#1F2937;color:#F5F5F0;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;">
                  ${ctaLabel}
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
 * 정기결제 자동 갱신 청구 실패 안내 메일. willRetryTomorrow가 true면 "내일 자동으로 한 번 더
 * 시도합니다"(연속 실패 횟수가 다운그레이드 임계치 미만), false면 "프리미엄이 해지됐습니다"
 * (임계치를 넘겨 자동 갱신을 껐을 때)로 문구가 갈린다.
 */
export function buildRenewalFailedEmailHtml(nickname: string, planLabel: string, willRetryTomorrow: boolean, dashboardUrl: string): string {
  const message = willRetryTomorrow
    ? `등록하신 카드로 ${escapeHtml(planLabel)} 자동 결제를 시도했지만 실패했어요. 내일 다시 한 번 자동으로 시도할게요 — 카드 한도/잔액을 확인해주세요.`
    : `등록하신 카드로 ${escapeHtml(planLabel)} 자동 결제가 여러 번 실패해서 자동 갱신을 중단했어요. 프리미엄 혜택은 남은 기간이 끝나면 해지됩니다. 계속 이용하시려면 대시보드에서 다시 결제해주세요.`;

  return buildSimpleEmailHtml({
    nickname,
    headingPlain: '',
    headingHighlight: '정기결제 자동 갱신에 실패했어요',
    message,
    ctaLabel: '대시보드에서 확인하기',
    ctaUrl: dashboardUrl,
  });
}

/** 가족/구성원 공유 초대 메일 — 받는 사람은 아직 계정이 없을 수도 있으니, "가입/로그인하면 보인다"는 걸 명시한다. */
export function buildShareInviteEmailHtml(inviteeEmail: string, ownerNickname: string, dashboardUrl: string): string {
  return buildSimpleEmailHtml({
    nickname: inviteeEmail,
    headingPlain: '',
    headingHighlight: `${ownerNickname}님이 챙길 목록을 공유했어요`,
    message: `${escapeHtml(
      ownerNickname
    )}님이 회원님을 구성원으로 초대했어요. Remindue에 이 이메일로 가입(또는 로그인)하면 대시보드의 "공유받은 목록"에서 초대를 확인하고 수락할 수 있어요.`,
    ctaLabel: '초대 확인하기',
    ctaUrl: dashboardUrl,
  });
}

/** 초대 수락 안내 — 초대를 보낸 소유자에게 발송한다. */
export function buildShareAcceptedEmailHtml(ownerNickname: string, accepterEmail: string, dashboardUrl: string): string {
  return buildSimpleEmailHtml({
    nickname: ownerNickname,
    headingPlain: '',
    headingHighlight: '구성원 초대를 수락했어요',
    message: `${escapeHtml(accepterEmail)}님이 초대를 수락해서 이제 회원님의 챙길 목록을 함께 볼 수 있어요.`,
    ctaLabel: '대시보드에서 확인하기',
    ctaUrl: dashboardUrl,
  });
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

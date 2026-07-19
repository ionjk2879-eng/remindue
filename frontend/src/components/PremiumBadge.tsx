interface PremiumBadgeProps {
  /** 최초 결제 승인 시각. 결제 이력이 없는 계정(결제 연동 이전부터 프리미엄이었던 계정)은 null — 이 경우 뱃지만 보여주고 기간/회차는 생략한다. */
  premiumSince: string | null;
  paymentCount: number;
}

/** "yyyy-MM-dd..." -> 오늘까지 며칠째인지(시작일 포함). */
function daysSince(dateStr: string): number {
  const start = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : 'Z'));
  const diffMs = Date.now() - start.getTime();
  return Math.max(1, Math.floor(diffMs / 86_400_000) + 1);
}

export default function PremiumBadge({ premiumSince, paymentCount }: PremiumBadgeProps) {
  const detail = premiumSince ? `프리미엄 ${daysSince(premiumSince)}일째 · ${paymentCount}회차 결제` : '프리미엄 회원';

  return (
    <span className="premium-badge" title={detail} aria-label={detail}>
      ✓
    </span>
  );
}

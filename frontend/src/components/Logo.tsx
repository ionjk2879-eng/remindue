interface LogoProps {
  /** 아이콘의 한 변 크기(px) */
  size?: number;
  className?: string;
}

/**
 * 기울어진 원형 도장 아이콘 — 이중 원(실선+점선) 안에 체크마크.
 * 브랜드 상징이라 색은 긴급도 레드로 고정한다(D-day 색 팔레트와 무관).
 */
export default function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      style={{ transform: 'rotate(-8deg)', flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" stroke="#C13B3B" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="15" stroke="#C13B3B" strokeWidth="1.5" strokeDasharray="3 3.4" />
      <path
        d="M15.5 24.5L20.5 29.5L32.5 16.5"
        stroke="#C13B3B"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

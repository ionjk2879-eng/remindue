import type { CSSProperties } from 'react';

const ROTATIONS = ['-4deg', '-1deg', '2deg', '5deg', '-3deg'];

function getVariant(dDay: number): { className: string; label: string } {
  if (dDay < 0) return { className: 'stamp-badge--overdue', label: '지남' };
  if (dDay <= 3) return { className: 'stamp-badge--urgent', label: '긴급' };
  if (dDay <= 14) return { className: 'stamp-badge--soon', label: '임박' };
  return { className: 'stamp-badge--safe', label: '여유' };
}

function formatValue(dDay: number): string {
  if (dDay < 0) return `D+${Math.abs(dDay)}`;
  if (dDay === 0) return 'D-DAY';
  return `D-${dDay}`;
}

interface StampBadgeProps {
  dDay: number;
  /** 카드마다 도장이 조금씩 다르게 찍힌 것처럼 보이게 하는 회전각 시드 (보통 항목의 id) */
  seed: number;
}

export default function StampBadge({ dDay, seed }: StampBadgeProps) {
  const variant = getVariant(dDay);
  const rotation = ROTATIONS[Math.abs(seed) % ROTATIONS.length];
  const style = { '--rot': rotation } as CSSProperties;

  return (
    <div className={`stamp-badge ${variant.className}`} style={style} title={`D-day ${dDay}`}>
      <span className="stamp-badge__value">{formatValue(dDay)}</span>
      <span className="stamp-badge__label">{variant.label}</span>
    </div>
  );
}

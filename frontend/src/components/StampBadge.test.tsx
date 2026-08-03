import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StampBadge from './StampBadge';

describe('StampBadge', () => {
  it('기한이 지난 항목을 D+ 형식과 지난 상태로 표시한다', () => {
    render(<StampBadge dDay={-2} seed={1} />);

    const badge = screen.getByTitle('D-day -2');
    expect(badge).toHaveClass('stamp-badge--overdue');
    expect(badge).toHaveTextContent('D+2');
  });

  it('오늘이 기한이면 긴급 D-DAY 상태로 표시한다', () => {
    render(<StampBadge dDay={0} seed={2} />);

    const badge = screen.getByTitle('D-day 0');
    expect(badge).toHaveClass('stamp-badge--urgent');
    expect(badge).toHaveTextContent('D-DAY');
  });

  it('확인이 필요한 항목에 주의 표시를 추가한다', () => {
    render(<StampBadge dDay={7} seed={3} needsAttention />);

    expect(screen.getByRole('img')).toHaveTextContent('!');
  });
});

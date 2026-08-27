import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PurchaseListTabs from './PurchaseListTabs';

describe('PurchaseListTabs', () => {
  it('delegates view selection and export actions', () => {
    const onChange = vi.fn();
    const onExport = vi.fn();
    render(<PurchaseListTabs
      view="ACTIVE" overdueCount={2} hasAcceptedShares exporting={false}
      onChange={onChange} onSelectShared={() => onChange('SHARED')} onExport={onExport}
    />);

    fireEvent.click(screen.getByRole('button', { name: /지난 항목/ }));
    fireEvent.click(screen.getByRole('button', { name: '공유받은 목록' }));
    fireEvent.click(screen.getByRole('button', { name: 'CSV 내보내기' }));
    expect(onChange).toHaveBeenNthCalledWith(1, 'OVERDUE');
    expect(onChange).toHaveBeenNthCalledWith(2, 'SHARED');
    expect(onExport).toHaveBeenCalledWith('csv');
  });
});

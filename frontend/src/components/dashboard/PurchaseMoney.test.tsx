import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FxHint, PurchaseAmount, formatOriginalAmount } from './PurchaseMoney';

describe('PurchaseMoney', () => {
  it('해외 결제 원금과 환산 금액을 함께 표시한다', () => {
    const { container } = render(
      <PurchaseAmount amount={8_822} originalAmount={5.5} originalCurrency="USD" />,
    );

    expect(container).toHaveTextContent('$5.50');
    expect(container).toHaveTextContent('8,822');
  });

  it('환율 근거를 표시한다', () => {
    render(<FxHint originalAmount={10} originalCurrency="USD" exchangeRate={1_604.3} />);

    expect(screen.getByText(/1 USD = 1,604\.3/)).toBeInTheDocument();
  });

  it('해외 결제 정보가 없으면 환율 근거를 숨긴다', () => {
    const { container } = render(
      <FxHint originalAmount={null} originalCurrency={null} exchangeRate={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('소문자 통화 코드를 정규화해 안전하게 표시한다', () => {
    const formatted = formatOriginalAmount(12.5, 'usd');

    expect(formatted).toContain('$');
    expect(formatted).toContain('12.50');
  });
});

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US', JPY: 'ja-JP', EUR: 'de-DE', GBP: 'en-GB', CNY: 'zh-CN',
};

export function formatOriginalAmount(amount: number, currency: string): string {
  const normalizedCurrency = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[normalizedCurrency] ?? 'en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${normalizedCurrency}`;
  }
}

export function PurchaseAmount({ amount, originalAmount, originalCurrency }: {
  amount: number;
  originalAmount: number | null;
  originalCurrency: string | null;
}) {
  if (originalCurrency && originalAmount !== null) {
    return <>{formatOriginalAmount(originalAmount, originalCurrency)} / {amount.toLocaleString('ko-KR')}원</>;
  }
  return <>{amount.toLocaleString('ko-KR')}원</>;
}

export function FxHint({ originalAmount, originalCurrency, exchangeRate }: {
  originalAmount: number | null;
  originalCurrency: string | null;
  exchangeRate: number | null;
}) {
  if (!originalCurrency || originalAmount === null) return null;
  return (
    <span className="fx-hint mono">
      {' '}({formatOriginalAmount(originalAmount, originalCurrency)}
      {exchangeRate !== null && ` · 1 ${originalCurrency} = ${exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}원`})
    </span>
  );
}

import { Link, useSearchParams } from 'react-router-dom';

/** 토스 결제창/빌링 인증창이 실패(또는 사용자가 닫음) 후 리다이렉트하는 곳. */
export default function BillingFailPage() {
  const [searchParams] = useSearchParams();
  const message = searchParams.get('message');

  return (
    <div className="billing-callback">
      <p className="billing-callback__icon billing-callback__icon--error">⚠</p>
      <p className="billing-callback__message">{message ?? '결제가 취소되었거나 실패했어요.'}</p>
      <Link className="btn" to="/pricing">
        다시 시도하기
      </Link>
    </div>
  );
}

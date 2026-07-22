import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <div className="landing__hero">
        <Logo size={64} className="landing__stamp" />
        <span className="landing__badge">D-DAY TRACKER</span>
        <h1 className="landing__headline">
          보증기간, 반품기한, 정기배송,
          <br />
          흩어진 기한을 <span className="accent">한 장의 티켓</span>으로
        </h1>
        <p className="landing__subcopy">
          정기배송 구독 확인 메일을 전달하면 자동으로 등록돼요.
          <br />
          보증기간·반품기한도 부가적으로 인식할 수 있어요.
        </p>
        <Link to="/signup" className="btn landing__cta">
          무료로 시작하기
        </Link>
        <Link to="/pricing" className="landing__pricing-link">
          요금제 보기
        </Link>
      </div>
    </div>
  );
}

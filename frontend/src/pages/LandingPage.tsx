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
          특히 반복되는 정기배송은 회차마다 따로 챙기지 않아도 되도록,
          다음 회차와 확인 여부를 한 곳에서 모아 보여드려요.
        </p>
        <Link to="/signup" className="btn landing__cta">
          무료로 시작하기
        </Link>
      </div>
    </div>
  );
}

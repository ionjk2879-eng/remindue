import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Header() {
  const { isAuthenticated, isPremium, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="site-header">
      <Link to="/" className="site-header__brand">
        <Logo size={26} />
        <span className="site-header__wordmark">Remindue</span>
      </Link>
      {isAuthenticated ? (
        <div className="site-header__nav">
          <Link to="/settings" className="site-header__link">
            설정
          </Link>
          {!isPremium && (
            <Link to="/pricing" className="site-header__link site-header__link--premium">
              ✨ 프리미엄
            </Link>
          )}
          <button className="btn btn-outline btn-sm" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      ) : (
        <Link to="/login" className="btn btn-outline btn-sm">
          로그인
        </Link>
      )}
    </header>
  );
}

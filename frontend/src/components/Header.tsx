import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

export default function Header() {
  const { isAuthenticated, logout } = useAuth();
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
        <button className="btn btn-outline btn-sm" onClick={handleLogout}>
          로그아웃
        </button>
      ) : (
        <Link to="/login" className="btn btn-outline btn-sm">
          로그인
        </Link>
      )}
    </header>
  );
}

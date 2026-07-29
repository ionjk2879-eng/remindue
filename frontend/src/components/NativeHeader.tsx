import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

export default function NativeHeader() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    closeMenu();
    logout();
    navigate('/login');
  };

  return (
    <header className="native-header">
      <Link to="/dashboard" className="native-header__brand" onClick={closeMenu}>
        <Logo size={24} />
        <span className="native-header__wordmark">Remindue</span>
      </Link>

      <div className="native-header__right">
        <div className="native-header__menu" ref={menuRef}>
          <button
            type="button"
            className="site-header__menu-toggle"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>

          <div className={`site-header__dropdown${menuOpen ? ' site-header__dropdown--open' : ''}`}>
            {isAuthenticated ? (
              <>
                <Link to="/faq" className="site-header__link" onClick={closeMenu}>FAQ</Link>
                <Link to="/feedback" className="site-header__link" onClick={closeMenu}>문의/제안</Link>
                <button className="btn btn-outline btn-sm" onClick={handleLogout}>로그아웃</button>
              </>
            ) : (
              <Link to="/faq" className="site-header__link" onClick={closeMenu}>FAQ</Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

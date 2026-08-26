import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshSession } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function GoogleAuthSuccessPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    refreshSession()
      .then((session) => {
        setAuth(session.accessToken, session.nickname, session.isPremium, session.hasSeenOnboarding);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        navigate('/login?error=google_failed', { replace: true });
      });
    // 마운트 시 1회 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="route-loading">Google 로그인 처리 중...</div>;
}

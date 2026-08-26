import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshSession } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function GoogleAuthSuccessPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // 백엔드가 CHIPS 파티션 우회를 위해 해시로 리프레시 토큰을 전달한다.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const rt = hash.get('rt') ?? undefined;
    // 토큰을 추출한 즉시 해시를 제거해 브라우저 히스토리에 남지 않게 한다.
    if (rt) window.history.replaceState(null, '', window.location.pathname);

    refreshSession(rt)
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

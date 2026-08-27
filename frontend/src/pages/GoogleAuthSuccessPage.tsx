import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { setAccessToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { AuthResponse } from '../types';

export default function GoogleAuthSuccessPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // 백엔드가 CHIPS 파티션 우회를 위해 해시로 리프레시 토큰을 전달한다.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const rt = hash.get('rt') ?? null;
    // 토큰을 추출한 즉시 해시를 제거해 브라우저 히스토리에 남지 않게 한다.
    if (rt) window.history.replaceState(null, '', window.location.pathname);

    if (!rt) {
      navigate('/login?error=google_failed', { replace: true });
      return;
    }

    // refreshSession() 싱글톤을 우회한다 — AuthContext가 mount 시 동시에 호출하는 refreshSession()이
    // refreshPromise를 점유하면 토큰 없는 빈 바디 요청이 재사용되기 때문.
    const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787/api';
    axios.post<AuthResponse>(
      `${baseURL}/auth/refresh`,
      { refreshToken: rt },
      { withCredentials: true }
    )
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        setAuth(data.accessToken, data.nickname, data.hasSeenOnboarding);
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

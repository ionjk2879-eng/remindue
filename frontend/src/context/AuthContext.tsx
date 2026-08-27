import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { logoutSession } from '../api/auth';
import { refreshSession, setAccessToken } from '../api/client';
import { clearNativeRefreshToken } from '../lib/native-auth';

interface AuthContextValue {
  nickname: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  /** 3단계 온보딩 안내를 완료했거나 건너뛰었는지 — false면 대시보드가 빈 목록일 때 온보딩을 띄운다. */
  hasSeenOnboarding: boolean;
  setAuth: (accessToken: string, nickname: string, hasSeenOnboarding: boolean) => void;
  /** 닉네임 변경 직후 토큰 재발급 없이 닉네임만 갱신한다. */
  updateNickname: (newNickname: string) => void;
  /** 온보딩 완료/건너뛰기 직후 서버 응답을 기다리지 않고 즉시 모달을 숨기기 위한 낙관적 갱신. */
  completeOnboarding: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  const setAuth = (accessToken: string, nickname: string, hasSeenOnboarding: boolean) => {
    setAccessToken(accessToken);
    setNickname(nickname);
    setHasSeenOnboarding(hasSeenOnboarding);
  };

  const completeOnboarding = () => {
    setHasSeenOnboarding(true);
  };

  const updateNickname = (newNickname: string) => {
    setNickname(newNickname);
  };

  const clearAuth = () => {
    if (nickname) localStorage.removeItem(`purchases_cache_${nickname}`);
    setAccessToken(null);
    setNickname(null);
    setHasSeenOnboarding(false);
  };

  const logout = async () => {
    try {
      await logoutSession();
    } finally {
      await clearNativeRefreshToken();
      clearAuth();
    }
  };

  useEffect(() => {
    // 이전 버전이 저장했던 토큰과 인증 메타데이터를 업그레이드 첫 실행에서 제거한다.
    localStorage.removeItem('accessToken');
    localStorage.removeItem('nickname');
    localStorage.removeItem('isPremium');
    localStorage.removeItem('hasSeenOnboarding');
    refreshSession()
      .then((session) => setAuth(session.accessToken, session.nickname, session.hasSeenOnboarding))
      .catch(() => clearAuth())
      .finally(() => setIsInitializing(false));

    const handleExpired = () => clearAuth();
    window.addEventListener('remindue:session-expired', handleExpired);
    return () => window.removeEventListener('remindue:session-expired', handleExpired);
    // 최초 마운트에서 HttpOnly 쿠키 세션을 한 번만 복구한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{
        nickname,
        isAuthenticated: !!nickname,
        isInitializing,
        hasSeenOnboarding,
        setAuth,
        updateNickname,
        completeOnboarding,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다');
  return ctx;
}

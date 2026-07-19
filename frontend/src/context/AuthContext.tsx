import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchBillingStatus } from '../api/billing';

interface AuthContextValue {
  nickname: string | null;
  isAuthenticated: boolean;
  /** 프리미엄 접근 권한 — 무제한 등록, 이번 주 배송 요약, 커스텀 알림 시점, CSV/PDF 내보내기, 가족 공유, 이력 보관. */
  isPremium: boolean;
  setAuth: (accessToken: string, nickname: string, isPremium: boolean) => void;
  /** 결제 성공 직후 토큰 재발급 없이 isPremium만 갱신한다 — 액세스 토큰은 그대로 둔다. */
  refreshPremium: (isPremium: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(localStorage.getItem('nickname'));
  const [isPremium, setIsPremium] = useState<boolean>(localStorage.getItem('isPremium') === 'true');

  const setAuth = (accessToken: string, nickname: string, isPremium: boolean) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('nickname', nickname);
    localStorage.setItem('isPremium', String(isPremium));
    setNickname(nickname);
    setIsPremium(isPremium);
  };

  const refreshPremium = (isPremium: boolean) => {
    localStorage.setItem('isPremium', String(isPremium));
    setIsPremium(isPremium);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('nickname');
    localStorage.removeItem('isPremium');
    setNickname(null);
    setIsPremium(false);
  };

  // isPremium은 로그인 시점/결제 성공 리다이렉트에서만 갱신되므로, 그 사이(다른 기기에서
  // 결제했거나 리다이렉트 페이지를 완전히 못 거쳤을 때) 값이 낡을 수 있다 — 앱을 열 때마다
  // 서버 기준 최신 상태로 한 번 더 맞춰둔다. 로그인 안 된 상태/일시적 오류는 조용히 무시하고
  // 기존 값을 유지한다(로그아웃 처리는 apiClient의 401 인터셉터가 이미 담당).
  useEffect(() => {
    if (!nickname) return;
    fetchBillingStatus()
      .then((status) => refreshPremium(status.isPremium))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ nickname, isAuthenticated: !!nickname, isPremium, setAuth, refreshPremium, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다');
  return ctx;
}

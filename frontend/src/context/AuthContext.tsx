import { createContext, useContext, useState, type ReactNode } from 'react';

interface AuthContextValue {
  nickname: string | null;
  isAuthenticated: boolean;
  /** 프리미엄 알림 기능(놓친 배송 감지 주간 리포트, 이번 주 배송 예정 요약) 접근 권한. */
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

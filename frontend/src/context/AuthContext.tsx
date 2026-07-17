import { createContext, useContext, useState, type ReactNode } from 'react';

interface AuthContextValue {
  nickname: string | null;
  isAuthenticated: boolean;
  setAuth: (accessToken: string, nickname: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(localStorage.getItem('nickname'));

  const setAuth = (accessToken: string, nickname: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('nickname', nickname);
    setNickname(nickname);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('nickname');
    setNickname(null);
  };

  return (
    <AuthContext.Provider value={{ nickname, isAuthenticated: !!nickname, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다');
  return ctx;
}

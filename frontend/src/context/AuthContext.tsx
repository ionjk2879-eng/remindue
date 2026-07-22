import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchBillingStatus } from '../api/billing';
import type { BillingStatus } from '../types';

let billingFetchedAt = 0;
const BILLING_CACHE_MS = 5 * 60 * 1000;

function isStoredTokenExpired(): boolean {
  const token = localStorage.getItem('accessToken');
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000;
  } catch {
    return true;
  }
}

function clearAuthStorage() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('nickname');
  localStorage.removeItem('isPremium');
}

interface AuthContextValue {
  nickname: string | null;
  isAuthenticated: boolean;
  /** 프리미엄 접근 권한 — 무제한 등록, 이번 주 배송 요약, 커스텀 알림 시점, CSV/PDF 내보내기, 가족 공유, 이력 보관. */
  isPremium: boolean;
  /** 최초 결제 승인 시각. 결제 이력이 없는 계정(결제 연동 이전부터 프리미엄이었던 계정)은 null. */
  premiumSince: string | null;
  /** 성공한 결제 총 횟수 — 프리미엄 뱃지의 "N회차"에 쓴다. */
  paymentCount: number;
  setAuth: (accessToken: string, nickname: string, isPremium: boolean) => void;
  /** 닉네임 변경 직후 토큰 재발급 없이 닉네임만 갱신한다. */
  updateNickname: (newNickname: string) => void;
  /** 결제/해지 직후 토큰 재발급 없이 프리미엄 상태만 갱신한다 — 액세스 토큰은 그대로 둔다. */
  refreshPremium: (status: Pick<BillingStatus, 'isPremium' | 'premiumSince' | 'paymentCount'>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // 토큰이 만료된 채로 앱을 열면 대시보드가 잠깐 보였다가 로그인 화면으로 튀는 문제 방지 —
  // 초기화 시점에 exp 클레임을 확인해 이미 만료됐으면 localStorage를 즉시 비운다.
  if (isStoredTokenExpired()) clearAuthStorage();

  const [nickname, setNickname] = useState<string | null>(localStorage.getItem('nickname'));
  const [isPremium, setIsPremium] = useState<boolean>(localStorage.getItem('isPremium') === 'true');
  const [premiumSince, setPremiumSince] = useState<string | null>(null);
  const [paymentCount, setPaymentCount] = useState(0);

  const setAuth = (accessToken: string, nickname: string, isPremium: boolean) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('nickname', nickname);
    localStorage.setItem('isPremium', String(isPremium));
    setNickname(nickname);
    setIsPremium(isPremium);
  };

  const updateNickname = (newNickname: string) => {
    localStorage.setItem('nickname', newNickname);
    setNickname(newNickname);
  };

  const refreshPremium = (status: Pick<BillingStatus, 'isPremium' | 'premiumSince' | 'paymentCount'>) => {
    localStorage.setItem('isPremium', String(status.isPremium));
    setIsPremium(status.isPremium);
    setPremiumSince(status.premiumSince);
    setPaymentCount(status.paymentCount);
    billingFetchedAt = Date.now();
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('nickname');
    localStorage.removeItem('isPremium');
    setNickname(null);
    setIsPremium(false);
    setPremiumSince(null);
    setPaymentCount(0);
  };

  // isPremium/premiumSince/paymentCount는 로그인 시점/결제 성공 리다이렉트에서만 갱신되므로,
  // 그 사이(다른 기기에서 결제했거나 리다이렉트 페이지를 완전히 못 거쳤을 때) 값이 낡을 수 있다 —
  // 앱을 열 때마다, 그리고 로그인해서 nickname이 채워질 때마다(같은 SPA 세션 안에서 로그인한
  // 경우도 포함) 서버 기준 최신 상태로 한 번 더 맞춰둔다. deps를 []로 두면 로그인 전에 마운트된
  // 첫 실행에서 nickname이 아직 없어 조용히 스킵된 뒤 로그인해도 다시 안 돌아 낡은 값(특히
  // premiumSince/paymentCount)이 남는 버그가 있었다. 로그인 안 된 상태/일시적 오류는 조용히
  // 무시하고 기존 값을 유지한다(로그아웃 처리는 apiClient의 401 인터셉터가 이미 담당).
  useEffect(() => {
    if (!nickname) return;
    const now = Date.now();
    if (now - billingFetchedAt < BILLING_CACHE_MS) return;
    billingFetchedAt = now;
    fetchBillingStatus()
      .then(refreshPremium)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nickname]);

  return (
    <AuthContext.Provider
      value={{ nickname, isAuthenticated: !!nickname, isPremium, premiumSince, paymentCount, setAuth, updateNickname, refreshPremium, logout }}
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

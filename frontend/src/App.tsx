import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import TesterRecruitBanner from './components/TesterRecruitBanner';
import KakaoChatButton from './components/KakaoChatButton';
import NativeTabBar from './components/NativeTabBar';
import NativeHeader from './components/NativeHeader';
import NativeInitializer from './components/NativeInitializer';
import { isNative } from './lib/native';
import LandingPage from './pages/LandingPage';
import type { ReactNode } from 'react';

// 프리렌더링된 페이지는 lazy()로 분리하지 않는다 — lazy()면 클라이언트가 그 청크를 다시
// 비동기로 불러오는 찰나에 Suspense가 fallback("불러오는 중...")을 커밋하면서 프리렌더링된
// 콘텐츠가 잠깐 사라졌다 재등장하는 깜빡임이 생긴다. 즉시 로드해서 첫 렌더가 프리렌더링
// 결과와 한 번에 일치하게 만든다. (프리렌더 대상: /, /pricing, /privacy, /terms, /faq)
import PricingPage from './pages/PricingPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import FaqPage from './pages/FaqPage';
import InstallGuidePage from './pages/InstallGuidePage';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const GoogleAuthSuccessPage = lazy(() => import('./pages/GoogleAuthSuccessPage'));
const BillingSuccessPage = lazy(() => import('./pages/BillingSuccessPage'));
const BillingAuthSuccessPage = lazy(() => import('./pages/BillingAuthSuccessPage'));
const BillingFailPage = lazy(() => import('./pages/BillingFailPage'));
const TicketDesignPreviewPage = lazy(() => import('./pages/TicketDesignPreviewPage'));
const FxRecalculationAdminPage = lazy(() => import('./pages/FxRecalculationAdminPage'));

const APP_SUSPENDED = import.meta.env.VITE_APP_SUSPENDED === 'true';

function ServiceSuspendedPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Remindue</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          서비스를 일시 중단 중이에요.<br />
          재개 시 별도로 안내드릴게요.
        </p>
        <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          <Link to="/terms" style={{ color: 'var(--text-secondary)' }}>이용약관</Link>
          <Link to="/privacy" style={{ color: 'var(--text-secondary)' }}>개인정보처리방침</Link>
        </div>
      </div>
      <footer style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', lineHeight: 1.8, paddingBottom: '1.5rem' }}>
        <p>상호명 지오스트컴퍼니 &nbsp;|&nbsp; 사업자 등록번호 467-27-02116 &nbsp;|&nbsp; 대표자 심주현</p>
        <p>전화 010-7682-2879 &nbsp;|&nbsp; 주소 대전광역시 서구 도안북로136</p>
        <span>© Remindue</span>
      </footer>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  if (isInitializing) return <RouteLoading />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RouteLoading() {
  return <div className="route-loading">불러오는 중...</div>;
}

function Layout() {
  if (isNative) {
    return (
      <>
        <NativeHeader />
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
        <NativeTabBar />
      </>
    );
  }
  return (
    <>
      <TesterRecruitBanner />
      <Header />
      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>
      <Footer />
      <KakaoChatButton />
    </>
  );
}

export default function App() {
  if (APP_SUSPENDED) {
    return (
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* 이용약관·개인정보처리방침은 중단 중에도 법적으로 접근 가능해야 한다. */}
            <Route element={<Layout />}>
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
            </Route>
            <Route path="*" element={<ServiceSuspendedPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        {/* useNavigate()로 알림 딥링크를 라우팅하려면(native.ts) BrowserRouter 안에 있어야 한다. */}
        <NativeInitializer />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <SettingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/fx-recalculations"
              element={
                <RequireAuth>
                  <FxRecalculationAdminPage />
                </RequireAuth>
              }
            />
            <Route path="/auth/google/success" element={<GoogleAuthSuccessPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route
              path="/billing/success"
              element={
                <RequireAuth>
                  <BillingSuccessPage />
                </RequireAuth>
              }
            />
            <Route
              path="/billing/auth-success"
              element={
                <RequireAuth>
                  <BillingAuthSuccessPage />
                </RequireAuth>
              }
            />
            <Route
              path="/billing/fail"
              element={
                <RequireAuth>
                  <BillingFailPage />
                </RequireAuth>
              }
            />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/install" element={<InstallGuidePage />} />
            <Route path="/ticket-preview" element={<TicketDesignPreviewPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

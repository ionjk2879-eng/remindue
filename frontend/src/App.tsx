import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
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

const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const FeedbackDetailPage = lazy(() => import('./pages/FeedbackDetailPage'));
const BillingSuccessPage = lazy(() => import('./pages/BillingSuccessPage'));
const BillingAuthSuccessPage = lazy(() => import('./pages/BillingAuthSuccessPage'));
const BillingFailPage = lazy(() => import('./pages/BillingFailPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RouteLoading() {
  return <div className="route-loading">불러오는 중...</div>;
}

function Layout() {
  return (
    <>
      <Header />
      <Suspense fallback={<RouteLoading />}>
        <Outlet />
      </Suspense>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            <Route path="/pricing" element={<PricingPage />} />
            <Route
              path="/feedback"
              element={
                <RequireAuth>
                  <FeedbackPage />
                </RequireAuth>
              }
            />
            <Route
              path="/feedback/:id"
              element={
                <RequireAuth>
                  <FeedbackDetailPage />
                </RequireAuth>
              }
            />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

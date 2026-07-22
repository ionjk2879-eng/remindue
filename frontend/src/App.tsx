import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import type { ReactNode } from 'react';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const FeedbackDetailPage = lazy(() => import('./pages/FeedbackDetailPage'));
const BillingSuccessPage = lazy(() => import('./pages/BillingSuccessPage'));
const BillingAuthSuccessPage = lazy(() => import('./pages/BillingAuthSuccessPage'));
const BillingFailPage = lazy(() => import('./pages/BillingFailPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function Layout() {
  return (
    <>
      <Header />
      <Suspense fallback={null}>
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

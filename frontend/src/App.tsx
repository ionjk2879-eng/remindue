import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import PricingPage from './pages/PricingPage';
import BillingSuccessPage from './pages/BillingSuccessPage';
import BillingAuthSuccessPage from './pages/BillingAuthSuccessPage';
import BillingFailPage from './pages/BillingFailPage';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function Layout() {
  return (
    <>
      <Header />
      <Outlet />
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
            <Route
              path="/pricing"
              element={
                <RequireAuth>
                  <PricingPage />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

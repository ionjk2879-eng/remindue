import { Navigate } from 'react-router-dom';

// Google 로그인이 가입+로그인을 통합하므로 /signup은 /login으로 리다이렉트한다.
export default function SignupPage() {
  return <Navigate to="/login" replace />;
}

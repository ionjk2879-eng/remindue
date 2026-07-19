import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agreed) {
      setError('개인정보 수집·이용에 동의해주세요.');
      return;
    }
    try {
      const res = await signup(email, password, nickname);
      setAuth(res.accessToken, res.nickname, res.isPremium);
      navigate('/dashboard');
    } catch {
      setError('회원가입에 실패했습니다. 이미 가입된 이메일일 수 있습니다.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-card__badge">R</span>
        <h1>회원가입</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="signup-nickname">닉네임</label>
            <input
              id="signup-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="signup-email">이메일</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="signup-password">비밀번호 (8자 이상)</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <label className="auth-consent">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              (필수) <Link to="/privacy">개인정보처리방침</Link>에 따른 개인정보 수집·이용에 동의합니다.
            </span>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn">
            가입하기
          </button>
        </form>
        <p className="auth-switch">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </p>
      </div>
    </div>
  );
}

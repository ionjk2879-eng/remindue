import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await signup(email, password, nickname);
      setAuth(res.accessToken, res.nickname);
      navigate('/dashboard');
    } catch {
      setError('회원가입에 실패했습니다. 이미 가입된 이메일일 수 있습니다.');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>회원가입</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="text" placeholder="닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} required />
        <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호 (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p style={{ color: 'crimson', fontSize: 14 }}>{error}</p>}
        <button type="submit">가입하기</button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        이미 계정이 있으신가요? <Link to="/login">로그인</Link>
      </p>
    </div>
  );
}

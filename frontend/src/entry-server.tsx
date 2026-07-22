// 빌드 타임 프리렌더링 전용 진입점 — main.tsx(브라우저 진입점)와는 별도로,
// scripts/prerender.mjs가 Vite의 ssrLoadModule로 이 모듈만 불러와 랜딩 페이지를
// 정적 HTML 문자열로 렌더링한다. 클라이언트 번들에는 포함되지 않는다.
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';

export function render(url: string) {
  return renderToString(
    <StaticRouter location={url}>
      <AuthProvider>
        <Header />
        <LandingPage />
        <Footer />
      </AuthProvider>
    </StaticRouter>,
  );
}

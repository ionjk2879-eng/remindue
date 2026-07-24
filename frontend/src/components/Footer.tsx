import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <Link to="/terms">이용약관</Link>
        <Link to="/privacy">개인정보처리방침</Link>
      </div>
      <p className="site-footer__biz">
        상호명 지오스트컴퍼니 &nbsp;|&nbsp; 사업자 등록번호 467-27-02116 &nbsp;|&nbsp; 대표자 심주현
      </p>
      <p className="site-footer__biz">
        전화 010-7682-2879 &nbsp;|&nbsp; 주소 대전광역시 서구 도안북로136
      </p>
      <span>© Remindue</span>
      {/* logo.dev 무료(Community) 플랜 이용 약관상 상업적 사용 시 필수인 출처 표기 —
          지우려면 유료 Startup 플랜으로 업그레이드해야 한다. */}
      <a className="site-footer__attribution" href="https://logo.dev" target="_blank" rel="noopener noreferrer">
        Logos provided by Logo.dev
      </a>
    </footer>
  );
}

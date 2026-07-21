import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__links">
        <Link to="/privacy">개인정보처리방침</Link>
      </div>
      <p className="site-footer__biz">
        상호명 지오스트컴퍼니 &nbsp;|&nbsp; 사업자 등록번호 467-27-02116
      </p>
      <span>© Remindue</span>
    </footer>
  );
}

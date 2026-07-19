import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <span>© Remindue</span>
      <Link to="/privacy">개인정보처리방침</Link>
    </footer>
  );
}

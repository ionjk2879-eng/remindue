import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <div className="landing__hero">
        <Logo size={64} className="landing__stamp" />
        <span className="landing__badge">D-DAY TRACKER</span>
        <h1 className="landing__headline">
          보증기간, 반품기한, 정기배송, 정기구독,
          <br />
          흩어진 기한을 <span className="accent">한 장의 티켓</span>으로
        </h1>
        <p className="landing__subcopy">
          정기배송 구독 확인 메일을 전달하면 자동으로 등록돼요.
          <br />
          보증기간·반품기한도 부가적으로 인식할 수 있어요.
        </p>
        <Link to="/signup" className="btn landing__cta">
          무료로 시작하기
        </Link>
        <Link to="/pricing" className="landing__pricing-link">
          요금제 보기
        </Link>

        <div className="landing__preview">
          <img
            src="/landing-preview-cards.png"
            alt="Remindue 대시보드 예시 — 전자제품 반품기한·A/S 보증, 온라인 주문 반품기한, 정기구독(Netflix, Claude Pro), 정기배송(생수) 카드가 D-day와 함께 나열된 모습"
            className="landing__preview-img"
            width={1080}
            height={1445}
          />
        </div>
      </div>

      <div className="landing__guide">
        <h2 className="landing__section-title">이렇게 써요</h2>
        <p className="landing__section-desc">
          가입 후 3단계면 끝이에요. 앱을 여는 습관 없이도 알아서 챙겨드려요.
        </p>
        <ol className="landing__steps">
          <li className="landing__step">
            <span className="landing__step-num">1</span>
            <div className="landing__step-body">
              <h3 className="landing__step-title">주문확인 메일을 자동화 주소로 전달</h3>
              <p className="landing__step-desc">
                가입하면 나만의 전달용 이메일 주소가 생겨요. 쇼핑몰 주문확인 메일을 이 주소로
                전달(포워딩)만 하면 돼요. (아래는 실제 주소가 아닌 예시예요)
              </p>
              <div className="landing__step-img-wrap">
                <img
                  src="/landing-step1-forwarding.png"
                  alt="주문확인 메일 자동 등록 주소 예시 — example@remindue.kr (실제로 동작하지 않는 예시 주소)"
                  className="landing__step-img"
                  width={1080}
                  height={180}
                />
              </div>
            </div>
          </li>
          <li className="landing__step">
            <span className="landing__step-num">2</span>
            <div className="landing__step-body">
              <h3 className="landing__step-title">AI가 자동으로 분류한 내용을 확인 후 등록</h3>
              <p className="landing__step-desc">
                상품명·주문일·반품기한·금액·카테고리까지 AI가 미리 채워둬요. 내용을 확인하고
                버튼 한 번만 누르면 등록 완료예요.
              </p>
              <div className="landing__step-img-wrap">
                <img
                  src="/landing-step2-pending.png"
                  alt="AI가 자동 분류해 확인 대기 중인 항목 예시 — 무신사 스탠다드 맨투맨, 일반구매, 주문일과 반품기한, 금액, 카테고리가 자동으로 채워진 모습"
                  className="landing__step-img"
                  width={1023}
                  height={170}
                />
              </div>
            </div>
          </li>
          <li className="landing__step">
            <span className="landing__step-num">3</span>
            <div className="landing__step-body">
              <h3 className="landing__step-title">남은 기간에 따라 다르게 알려드려요</h3>
              <p className="landing__step-desc">
                여유 있을 땐 조용히, 마감이 가까워질수록 눈에 띄게 — D-day에 따라 색이 달라지는
                스탬프로 한눈에 급한 순서를 알 수 있어요.
              </p>
              <div className="landing__stamps-row">
                <img
                  src="/landing-step3-stamp1.png"
                  alt="D-2, 긴급 — 마감이 임박하면 빨간색 스탬프로 표시"
                  width={165}
                  height={306}
                />
                <img
                  src="/landing-step3-stamp2.png"
                  alt="D-6, 임박 — 노란색 스탬프로 표시"
                  width={165}
                  height={273}
                />
                <img
                  src="/landing-step3-stamp3.png"
                  alt="D-15, 여유 — 초록색 스탬프로 표시"
                  width={165}
                  height={251}
                />
              </div>
            </div>
          </li>
        </ol>
      </div>

      <div className="landing__dashboard-peek">
        <h2 className="landing__section-title">이번 달 예상 지출도 자동 계산</h2>
        <p className="landing__section-desc">
          정기배송·정기구독·A/S 보증까지, 등록해둔 항목을 바탕으로 이번 달과 올해 예상 지출을
          한눈에 볼 수 있어요.
        </p>
        <img
          src="/landing-summary-board.png"
          alt="대시보드 요약 보드 예시 — 이번 달/올해 예상 지출, 이번 주 결제, 정기배송·정기구독 건수, 가격 인상 감지, AI 절약 제안이 타일 형태로 표시된 모습"
          width={1080}
          height={207}
        />
        <p className="landing__disclaimer">
          무료 요금제와 프리미엄 요금제는 이용 가능한 기능에 차이가 있을 수 있어요.{' '}
          <Link to="/pricing">요금제 비교하기</Link>
        </p>
      </div>

      <div className="landing__final-cta">
        <Link to="/signup" className="btn landing__cta">
          무료로 시작하기
        </Link>
        <Link to="/faq" className="landing__pricing-link">
          자주 묻는 질문(FAQ) 보기
        </Link>
      </div>
    </div>
  );
}

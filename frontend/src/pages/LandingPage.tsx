import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

type Step = {
  title: string;
  desc: string;
  content: ReactNode;
};

const STEPS: Step[] = [
  {
    title: '주문확인 메일을 자동화 주소로 전달',
    desc: '가입하면 나만의 전달용 이메일 주소가 생겨요. 쇼핑몰 주문확인 메일을 이 주소로 전달(포워딩)만 하면 돼요. (아래는 실제 주소가 아닌 예시예요)',
    content: (
      <div className="landing__step-img-wrap">
        <img
          src="/landing-step1-forwarding.png"
          alt="주문확인 메일 자동 등록 주소 예시 — example@remindue.kr (실제로 동작하지 않는 예시 주소)"
          className="landing__step-img"
          width={1080}
          height={180}
        />
      </div>
    ),
  },
  {
    title: 'AI가 자동으로 분류한 내용을 확인 후 등록',
    desc: '상품명·주문일·반품기한·금액·카테고리까지 AI가 미리 채워둬요. 내용을 확인하고 버튼 한 번만 누르면 등록 완료예요.',
    content: (
      <div className="landing__step-img-wrap">
        <img
          src="/landing-step2-pending.png"
          alt="AI가 자동 분류해 확인 대기 중인 항목 예시 — 무신사 스탠다드 맨투맨, 일반구매, 주문일과 반품기한, 금액, 카테고리가 자동으로 채워진 모습"
          className="landing__step-img"
          width={1023}
          height={170}
        />
      </div>
    ),
  },
  {
    title: '남은 기간에 따라 다르게 알려드려요',
    desc: '여유 있을 땐 조용히, 마감이 가까워질수록 눈에 띄게 — D-day에 따라 색이 달라지는 스탬프로 한눈에 급한 순서를 알 수 있어요.',
    content: (
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
    ),
  },
];

function LandingCarousel({ steps }: { steps: Step[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const syncHeight = () => {
    const track = trackRef.current;
    const slide = track?.children[active];
    if (track && slide instanceof HTMLElement) {
      track.style.height = `${slide.offsetHeight}px`;
    }
  };

  useLayoutEffect(syncHeight, [active]);

  useEffect(() => {
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [active]);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const slide = track?.children[index];
    if (track && slide instanceof HTMLElement) {
      track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
    }
    setActive(index);
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setActive(Math.min(steps.length - 1, Math.max(0, index)));
  };

  return (
    <div className="landing__carousel">
      <div className="landing__carousel-row">
        <button
          type="button"
          className="landing__carousel-arrow landing__carousel-arrow--prev"
          onClick={() => scrollToIndex(Math.max(0, active - 1))}
          disabled={active === 0}
          aria-label="이전 단계"
        >
          ‹
        </button>
        <div className="landing__carousel-track" ref={trackRef} onScroll={handleScroll}>
          {steps.map((step, i) => (
            <div className="landing__slide" key={step.title}>
              <div className="landing__step-head">
                <span className="landing__step-num">{i + 1}</span>
                <h3 className="landing__step-title">{step.title}</h3>
              </div>
              <p className="landing__step-desc">{step.desc}</p>
              {step.content}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="landing__carousel-arrow landing__carousel-arrow--next"
          onClick={() => scrollToIndex(Math.min(steps.length - 1, active + 1))}
          disabled={active === steps.length - 1}
          aria-label="다음 단계"
        >
          ›
        </button>
      </div>
      <div className="landing__carousel-dots">
        {steps.map((step, i) => (
          <button
            type="button"
            key={step.title}
            className={`landing__carousel-dot${i === active ? ' landing__carousel-dot--active' : ''}`}
            onClick={() => scrollToIndex(i)}
            aria-label={`${i + 1}단계로 이동`}
          />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const currentMonth = new Date().getMonth() + 1;

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
        <LandingCarousel steps={STEPS} />
      </div>

      <div className="landing__dashboard-peek">
        <h2 className="landing__section-title">이번 달 예상 지출도 자동 계산</h2>
        <p className="landing__section-desc">
          정기배송·정기구독·A/S 보증까지, 등록해둔 항목을 바탕으로 이번 달과 올해 예상 지출을
          한눈에 볼 수 있어요.
        </p>
        <div className="landing__summary-preview" aria-label="대시보드 요약 보드 예시">
          <div className="summary-board">
            <div className="summary-board__tile summary-board__tile--spending">
              <span className="summary-board__icon" aria-hidden="true">💳</span>
              <div className="summary-board__text">
                <span className="summary-board__label">{currentMonth}월 예상지출</span>
                <span className="summary-board__value mono">
                  128,400<span className="summary-board__unit">원</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">▾</span>
            </div>
            <div className="summary-board__tile summary-board__tile--yearly">
              <span className="summary-board__icon" aria-hidden="true">📈</span>
              <div className="summary-board__text">
                <span className="summary-board__label">올해 예상 지출</span>
                <span className="summary-board__value mono">
                  1,540,800<span className="summary-board__unit">원</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">▾</span>
            </div>
            <div className="summary-board__tile summary-board__tile--week">
              <span className="summary-board__icon" aria-hidden="true">📅</span>
              <div className="summary-board__text">
                <span className="summary-board__label">이번 주 결제</span>
                <span className="summary-board__value mono">
                  2<span className="summary-board__unit">건</span>
                </span>
              </div>
            </div>
            <div className="summary-board__tile summary-board__tile--delivery">
              <span className="summary-board__icon" aria-hidden="true">📦</span>
              <div className="summary-board__text">
                <span className="summary-board__label">정기배송</span>
                <span className="summary-board__value mono">
                  1<span className="summary-board__unit">건</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">▾</span>
            </div>
            <div className="summary-board__tile summary-board__tile--subscription">
              <span className="summary-board__icon" aria-hidden="true">🔄</span>
              <div className="summary-board__text">
                <span className="summary-board__label">정기구독</span>
                <span className="summary-board__value mono">
                  3<span className="summary-board__unit">건</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">▾</span>
            </div>
            <div className="summary-board__tile summary-board__tile--price-change">
              <span className="summary-board__icon" aria-hidden="true">⚠</span>
              <div className="summary-board__text">
                <span className="summary-board__label">가격 인상 감지</span>
                <span className="summary-board__value mono">
                  1<span className="summary-board__unit">건</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">▾</span>
            </div>
            <div className="summary-board__tile summary-board__tile--savings">
              <span className="summary-board__icon" aria-hidden="true">💡</span>
              <div className="summary-board__text">
                <span className="summary-board__label">AI 절약 제안</span>
                <span className="summary-board__value mono">
                  12,000<span className="summary-board__unit">원 절약 가능</span>
                </span>
              </div>
              <span className="summary-board__chevron" aria-hidden="true">▾</span>
            </div>
          </div>
        </div>
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

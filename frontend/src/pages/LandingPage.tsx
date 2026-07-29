import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import InstallAppBanner from '../components/InstallAppBanner';
import { isNative } from '../lib/native';

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

const AUTOPLAY_INTERVAL_MS = 4500;
const SCROLL_SETTLE_MS = 120;

function LandingCarousel({ steps }: { steps: Step[] }) {
  const total = steps.length;
  // 앞뒤에 마지막/첫 슬라이드의 클론을 하나씩 붙여서 끝에 닿으면 반대쪽으로 순간 이동시키는
  // 방식으로 무한 반복처럼 보이게 한다. 실제 DOM 위치(pos)는 1..total이 진짜 슬라이드,
  // 0과 total+1은 각각 마지막/첫 슬라이드의 클론이다.
  const extended = [steps[total - 1], ...steps, steps[0]];

  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const posRef = useRef(1);
  const draggingRef = useRef<{ startX: number; startScrollLeft: number; startPos: number } | null>(null);
  const autoplayTimerRef = useRef<number | undefined>(undefined);
  const settleTimerRef = useRef<number | undefined>(undefined);
  // 마우스가 캐러셀 위를 지나가며 걸리는 일시정지(hover)와, 클릭으로 명시적으로 멈춘 상태를
  // 구분한다 — 그래야 명시적으로 멈춘 뒤 마우스가 빠져나가도 제멋대로 다시 재생되지 않는다.
  const manualPauseRef = useRef(false);
  // 드래그(슬라이드 이동)와 단순 클릭(재생/일시정지 토글)을 구분하기 위한 플래그.
  const wasDragRef = useRef(false);
  // 클릭 시작(pointerdown) 시점에 pauseAutoplay가 먼저 걸려버리므로, 그 전 상태를 따로
  // 기억해뒀다가 클릭 핸들러에서 "눌렀을 때 재생 중이었는지"로 토글 방향을 판단한다.
  const wasPlayingBeforePressRef = useRef(true);
  // 클릭할 때만 잠깐 나타났다 사라지는 큰 재생/일시정지 아이콘 — 평소엔 아무것도 안 보인다.
  const [flash, setFlash] = useState<{ id: number; playing: boolean } | null>(null);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const flashIdRef = useRef(0);

  const showFlash = (playing: boolean) => {
    flashIdRef.current += 1;
    setFlash({ id: flashIdRef.current, playing });
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 700);
  };

  // 슬라이드마다 콘텐츠 높이(이미지 비율 등)가 달라서 현재 슬라이드에만 맞춰 높이를
  // 바꾸면 클릭할 때마다 박스는 물론 페이지 전체 길이까지 따라 바뀐다. 대신 전체 슬라이드
  // 중 가장 큰 높이로 트랙 높이를 고정해, 어떤 슬라이드를 보든 레이아웃이 그대로 유지되게 한다.
  const recalcMaxHeight = () => {
    const track = trackRef.current;
    if (!track) return;
    let max = 0;
    for (const child of Array.from(track.children)) {
      if (child instanceof HTMLElement) max = Math.max(max, child.offsetHeight);
    }
    if (max > 0) track.style.height = `${max}px`;
  };

  const applyPos = (pos: number, smooth: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: pos * track.clientWidth, behavior: smooth ? 'smooth' : 'instant' });
    posRef.current = pos;
    setActive(((pos - 1) % total + total) % total);
  };

  const restartAutoplay = () => {
    manualPauseRef.current = false;
    window.clearInterval(autoplayTimerRef.current);
    autoplayTimerRef.current = window.setInterval(() => {
      applyPos(posRef.current + 1, true);
    }, AUTOPLAY_INTERVAL_MS);
    setIsPlaying(true);
  };

  const pauseAutoplay = () => {
    window.clearInterval(autoplayTimerRef.current);
    setIsPlaying(false);
  };

  const handleMouseLeave = () => {
    if (!manualPauseRef.current) restartAutoplay();
  };

  // 트랙을 드래그해서 슬라이드를 넘긴 경우(endDrag가 이미 재생을 재개시킴)엔 뒤이어 발생하는
  // 클릭 이벤트에서 토글하지 않는다 — 순수 클릭(이동 없음)일 때만, pointerdown 이전 상태를
  // 기준으로 재생/일시정지를 토글하고 큰 아이콘을 잠깐 보여준다.
  const handleTrackClick = () => {
    if (wasDragRef.current) {
      wasDragRef.current = false;
      return;
    }
    if (wasPlayingBeforePressRef.current) {
      manualPauseRef.current = true;
      pauseAutoplay();
      showFlash(false);
    } else {
      restartAutoplay();
      showFlash(true);
    }
  };

  const goToRealIndex = (index: number) => {
    applyPos(index + 1, true);
    restartAutoplay();
  };

  const next = () => {
    applyPos(posRef.current + 1, true);
    restartAutoplay();
  };

  const prev = () => {
    applyPos(posRef.current - 1, true);
    restartAutoplay();
  };

  // 스크롤이 완전히 멈춘 뒤에만 active를 갱신해 도트가 전환 중간에 깜빡이지 않게 하고,
  // 클론 위치(0 또는 total+1)에 도달했으면 티 안 나게(behavior:'instant') 반대쪽 진짜
  // 슬라이드 위치로 순간 이동시켜 계속 같은 방향으로 넘길 수 있게 한다.
  const handleScroll = () => {
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const track = trackRef.current;
      if (!track || track.clientWidth === 0 || draggingRef.current) return;
      const pos = Math.round(track.scrollLeft / track.clientWidth);
      if (pos === 0) {
        applyPos(total, false);
      } else if (pos === total + 1) {
        applyPos(1, false);
      } else if (pos !== posRef.current) {
        posRef.current = pos;
        setActive(((pos - 1) % total + total) % total);
      }
    }, SCROLL_SETTLE_MS);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    wasDragRef.current = false;
    wasPlayingBeforePressRef.current = isPlaying;
    pauseAutoplay();
    if (e.pointerType !== 'mouse') return; // 터치/트랙패드는 네이티브 스크롤+스냅에 맡긴다
    const track = trackRef.current;
    if (!track) return;
    draggingRef.current = { startX: e.clientX, startScrollLeft: track.scrollLeft, startPos: posRef.current };
    track.setPointerCapture(e.pointerId);
    track.style.scrollSnapType = 'none';
    track.style.cursor = 'grabbing';
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = draggingRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;
    if (Math.abs(e.clientX - drag.startX) > 5) wasDragRef.current = true;
    // scrollLeft 직접 대입이나 behavior:'auto'는 CSS scroll-behavior:smooth를 그대로
    // 따라가버려서 커서를 못 따라가고 애니메이션으로 지연된다. 'instant'만 CSS를
    // 무시하고 즉시 반영된다.
    track.scrollTo({ left: drag.startScrollLeft - (e.clientX - drag.startX), behavior: 'instant' });
  };

  const endDrag = () => {
    const track = trackRef.current;
    if (!draggingRef.current || !track) return;
    const { startPos } = draggingRef.current;
    draggingRef.current = null;
    track.style.scrollSnapType = '';
    track.style.cursor = '';
    if (!wasDragRef.current) return; // 이동 없는 순수 클릭 — 재생 여부는 클릭 핸들러가 정한다
    // 아무리 멀리(빠르게) 드래그해도 시작 위치 기준 한 슬라이드까지만 이동한다.
    const nearest = Math.round(track.scrollLeft / track.clientWidth);
    const clamped = Math.max(startPos - 1, Math.min(startPos + 1, nearest));
    applyPos(clamped, true);
    restartAutoplay();
  };

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track) {
      // track에 CSS scroll-behavior:smooth가 걸려 있어서 scrollLeft 직접 대입이나
      // behavior:'auto'는 그 CSS를 그대로 따라가 애니메이션이 돼버린다(스펙상 'auto'는
      // "CSS에 맡긴다"는 뜻). 'instant'만 CSS와 무관하게 즉시 이동한다.
      track.scrollTo({ left: track.clientWidth * posRef.current, behavior: 'instant' });
      recalcMaxHeight();
    }
    restartAutoplay();

    // 이미지가 늦게 로드되며 실제 높이가 바뀌는 경우(및 창 크기 변경으로 줄바꿈이 달라지는
    // 경우)까지 잡아내기 위해 각 슬라이드를 관찰하다가 크기가 바뀔 때마다 최댓값을 다시 잰다.
    const observer = new ResizeObserver(() => recalcMaxHeight());
    if (track) {
      for (const child of Array.from(track.children)) observer.observe(child);
    }

    return () => {
      observer.disconnect();
      window.clearInterval(autoplayTimerRef.current);
      window.clearTimeout(settleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollTo({ left: track.clientWidth * posRef.current, behavior: 'instant' });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="landing__carousel" onMouseEnter={pauseAutoplay} onMouseLeave={handleMouseLeave}>
      <div className="landing__carousel-row">
        <button
          type="button"
          className="landing__carousel-arrow landing__carousel-arrow--prev"
          onClick={prev}
          aria-label="이전 단계"
        >
          ‹
        </button>
        <div
          className="landing__carousel-track"
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={handleTrackClick}
          role="button"
          tabIndex={-1}
          aria-label={isPlaying ? '자동 재생 멈추기' : '자동 재생 시작'}
        >
          {extended.map((step, i) => {
            const realIndex = ((i - 1) % total + total) % total;
            return (
              <div className="landing__slide" key={`${step.title}-${i}`} aria-hidden={realIndex !== active}>
                <div className="landing__step-head">
                  <span className="landing__step-num">{realIndex + 1}</span>
                  <h3 className="landing__step-title">{step.title}</h3>
                </div>
                <p className="landing__step-desc">{step.desc}</p>
                {step.content}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="landing__carousel-arrow landing__carousel-arrow--next"
          onClick={next}
          aria-label="다음 단계"
        >
          ›
        </button>
        {flash && (
          <div key={flash.id} className="landing__carousel-flash" aria-hidden="true">
            {flash.playing ? (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4.5v15l14-7.5-14-7.5z" />
              </svg>
            ) : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="4" width="5" height="16" rx="1" />
                <rect x="14" y="4" width="5" height="16" rx="1" />
              </svg>
            )}
          </div>
        )}
      </div>
      <div className="landing__carousel-dots">
        {steps.map((step, i) => (
          <button
            type="button"
            key={step.title}
            className={`landing__carousel-dot${i === active ? ' landing__carousel-dot--active' : ''}`}
            onClick={() => goToRealIndex(i)}
            aria-label={`${i + 1}단계로 이동`}
          />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isAuthenticated, isInitializing } = useAuth();
  const currentMonth = new Date().getMonth() + 1;

  // 네이티브 앱에서만 로그인 확인이 끝날 때까지 대기한다 — 그렇지 않으면 로그인된 사용자가
  // 이 랜딩 화면을 한 프레임 봤다가 대시보드로 리다이렉트되는 깜빡임이 생긴다(대기하는 동안은
  // 스플래시 화면이 대신 가려준다, lib/native.ts의 hideSplash 참고). isNative 조건이 꼭
  // 필요한 이유: 이 페이지는 웹사이트 빌드 시 prerender.mjs가 renderToString으로 정적
  // HTML을 미리 만드는데, 그 과정에서는 useEffect가 아예 실행되지 않아 isInitializing이
  // 영원히 true로 남는다 — isNative 없이 이 조건만 걸면 "/" 정적 페이지가 항상 로딩 문구만
  // 보여주게 되어 SEO/최초 진입 화면이 깨진다. 네이티브 빌드(build:cap)는 prerender를 아예
  // 거치지 않으므로 이 분기가 안전하다.
  if (isNative && isInitializing) return <div className="route-loading">불러오는 중...</div>;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <InstallAppBanner />
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

      <div className="landing__features">
        <h2 className="landing__section-title">이런 것도 챙겨드려요</h2>
        <p className="landing__section-desc">
          등록만 해두면 세세한 부분까지 알아서 챙겨드려요.
        </p>
        <div className="landing__features-grid">
          <div className="landing__feature-card">
            <img
              src="/landing-feature-notifications.png"
              alt="알림 테스트 화면 예시 — 기한 예정 알림, 정기배송·구독 유지 확인 테스트, 배송 수령 확인 테스트, 주간 요약 테스트 버튼"
              className="landing__feature-img"
              width={578}
              height={114}
            />
            <h3>상황에 맞는 알림</h3>
            <p>기한 임박, 정기배송·구독 유지 확인, 수령 확인, 주간 요약까지 — 필요한 순간에 필요한 알림만 보내드려요.</p>
          </div>
          <div className="landing__feature-card">
            <img
              src="/landing-feature-renewal-check.png"
              alt="정기배송·구독 유지 확인 설정 화면 예시 — D-1일, 당일, 미응답 시 D+7 절약 검토 옵션"
              className="landing__feature-img"
              width={578}
              height={229}
            />
            <h3>정기배송·구독 유지 확인</h3>
            <p>다음 배송·결제 전에 "계속 유지할까요?"라고 물어봐요. 응답이 없으면 며칠 뒤 절약 검토 대상으로 한 번 더 알려드려요.</p>
          </div>
          <div className="landing__feature-card">
            <img
              src="/landing-feature-ai-manager.png"
              alt="AI 소비 매니저 브리핑 화면 예시 — 소비 건강도 점수, 이번 달 예상 지출, 구독 수, 전월 대비 증감률, 최다 지출 카테고리와 AI 분석 코멘트"
              className="landing__feature-img"
              width={718}
              height={497}
            />
            <h3>AI 소비 매니저</h3>
            <p>등록해둔 항목을 바탕으로 이번 달 소비 건강도, 지출 변화, 절약 포인트를 AI가 한 번에 정리해드려요.</p>
          </div>
          <div className="landing__feature-card">
            <img
              src="/landing-feature-sharing.png"
              alt="구성원 공유 초대 화면 예시 — 이메일로 초대하면 초대받은 사람이 목록을 읽기 전용으로 볼 수 있음"
              className="landing__feature-img"
              width={578}
              height={128}
            />
            <h3>가족·구성원과 공유</h3>
            <p>이메일 하나로 초대하면 끝. 초대받은 사람은 내 목록을 읽기 전용으로 바로 확인할 수 있어요.</p>
          </div>
        </div>
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

import { useState } from 'react';
import Logo from './Logo';

interface Step {
  title: string;
  body: string;
  ctaLabel: string;
}

const STEPS: Step[] = [
  {
    title: '정기배송·구독을 한곳에',
    body: '생수, 밀키트, 각종 구독 서비스... 여러 브랜드에 흩어진 정기배송 일정, Remindue 하나로 모아서 챙기세요.',
    ctaLabel: '다음',
  },
  {
    title: '보증기간, 반품기한도 놓치지 않게',
    body: '정기배송뿐 아니라 전자제품 보증기간, 온라인 주문 반품기한도 부가적으로 함께 관리할 수 있어요.',
    ctaLabel: '다음',
  },
  {
    title: '지금 첫 항목을 등록해보세요',
    body: '아래 등록 폼에 첫 항목을 입력하면 바로 D-day 티켓이 만들어져요.',
    ctaLabel: '등록하러 가기',
  },
];

interface OnboardingOverlayProps {
  /** focusForm이 true면 마지막 단계 CTA로 닫힌 것 — 등록 폼으로 포커스를 옮긴다. */
  onDone: (focusForm: boolean) => void;
}

export default function OnboardingOverlay({ onDone }: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <Logo size={40} className="onboarding-modal__stamp" />
        <h2 className="onboarding-modal__title">{current.title}</h2>
        <p className="onboarding-modal__body">{current.body}</p>

        <div className="onboarding-modal__dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`onboarding-dot${i === step ? ' onboarding-dot--active' : ''}`} />
          ))}
        </div>

        <div className="onboarding-modal__actions">
          <button type="button" className="btn-text" onClick={() => onDone(false)}>
            건너뛰기
          </button>
          <button type="button" className="btn" onClick={() => (isLast ? onDone(true) : setStep((s) => s + 1))}>
            {current.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

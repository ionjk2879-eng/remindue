import { useState } from 'react';
import { Link } from 'react-router-dom';

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

interface FaqCategory {
  label: string;
  items: FaqItem[];
}

const FAQ: FaqCategory[] = [
  {
    label: '서비스 이용',
    items: [
      {
        q: 'Remindue는 어떤 서비스인가요?',
        a: '일반 구매의 반품·A/S 기간, 정기배송의 다음 배송일, 정기구독의 다음 결제일을 한곳에서 관리하고 알림을 받을 수 있는 서비스입니다. 항목별 금액을 입력하면 월간·연간 지출도 함께 확인할 수 있어요.',
      },
      {
        q: '어떤 항목을 등록할 수 있나요?',
        a: '일반 구매, 정기배송, 정기구독을 등록할 수 있습니다. 소프트웨어, AI, 엔터테인먼트, 쇼핑, 식품, 뷰티, 반려동물, 전자제품 등 카테고리도 직접 선택할 수 있어요.',
      },
      {
        q: '직접 등록도 가능한가요?',
        a: '네. 대시보드의 “새 항목 등록”에서 상품명, 날짜, 금액, 구매 유형, 반품 기한, A/S 보증기간, 배송·결제 주기 등을 직접 입력할 수 있습니다.',
      },
    ],
  },
  {
    label: '이메일 자동 등록',
    items: [
      {
        q: '주문확인 메일은 어떻게 등록하나요?',
        a: (
          <>
            대시보드에 표시된 개인 전용 자동 등록 주소로 쇼핑몰의 주문확인 메일을 전달(포워딩)하세요. AI가 상품명·주문일·금액 등의 정보를 읽어 “확인 대기” 목록에 올립니다. 내용을 검토하고 필요한 부분을 수정한 뒤 등록하면 됩니다.
          </>
        ),
      },
      {
        q: '사진, 영수증 이미지, 스크린샷으로도 등록할 수 있나요?',
        a: '아직 지원하지 않습니다. 현재 자동 등록은 전달된 주문확인 이메일의 텍스트를 기준으로 동작합니다. 이미지 파일을 첨부하거나 사진을 올려 등록하는 기능은 준비 중이며, 필요한 항목은 직접 등록해 주세요.',
      },
      {
        q: '이메일로 등록한 내용은 항상 정확한가요?',
        a: '아니요. 이메일에 적힌 정보를 AI가 추출하므로 상품명, 날짜, 금액 또는 구매 유형이 부정확하거나 비어 있을 수 있습니다. 자동으로 바로 등록되지 않고 확인 대기 목록에 먼저 표시되므로, 등록 전에 내용을 꼭 검토해 주세요.',
      },
      {
        q: '정기배송·정기구독 메일을 전달할 때 주의할 점이 있나요?',
        a: '주문확인 메일에는 주기가 없는 경우가 많습니다. 정기배송 또는 정기구독으로 관리하려면 전달하는 이메일 내용에 배송·결제 주기와 주문일을 함께 적어 주세요. 예: “주기 1개월”, “고정 15일”, “주문 4월 2일”.',
      },
      {
        q: '자동 등록 주소를 바꿀 수 있나요?',
        a: '네. 대시보드에서 주소를 재생성할 수 있습니다. 재생성 후에는 기존 주소로 보낸 메일을 받을 수 없으니, 쇼핑몰의 전달 규칙도 새 주소로 바꿔 주세요.',
      },
    ],
  },
  {
    label: '기한·가격 관리',
    items: [
      {
        q: '반품 기한과 A/S 보증기간은 정확한가요?',
        a: '이메일에 기한이 명시되지 않으면 반품 기한은 법정 최소 기준인 7일, 전자제품으로 판단된 일반 구매의 A/S 보증기간은 12개월로 추정될 수 있습니다. 실제 정책은 판매처·상품마다 다르므로 주문 내역 또는 상품 페이지에서 확인한 뒤 수정해 주세요.',
      },
      {
        q: '가격 인상 감지는 어떻게 동작하나요?',
        a: '이미 등록한 정기배송·정기구독과 같은 상품의 새 주문확인 메일에서 금액이 달라지면 확인 대기 목록에 가격 인상으로 표시할 수 있습니다. 표시된 금액을 확인한 후 적용하면 기존 항목의 금액이 갱신됩니다.',
      },
      {
        q: '등록한 항목을 수정하거나 없앨 수 있나요?',
        a: '네. 목록에서 항목을 열어 날짜, 금액, 주기, 카테고리 등을 수정할 수 있습니다. 주문 취소·환불 등으로 더 이상 필요 없는 항목은 취소할 수 있으며, 취소한 항목은 지출 기록에서도 제외됩니다.',
      },
    ],
  },
  {
    label: '알림',
    items: [
      {
        q: '알림이 오지 않아요.',
        a: (
          <>
            브라우저와 기기 모두에서 알림 권한이 허용되어 있는지 확인해 주세요. 주소창의 사이트 설정에서 <strong>remindue.kr</strong>의 알림을 허용하고, 기기 시스템 설정에서도 브라우저 알림이 켜져 있어야 합니다.
            <br /><br />
            <strong>홈 화면에 추가(PWA)해서 쓰고 계시다면</strong> 안드로이드는 이걸 Chrome과는 별개의 앱으로 인식해요.
            브라우저에서 알림을 허용했더라도, 휴대폰 <strong>설정 → 앱 → Remindue → 알림</strong>에서 따로 한 번 더 켜져 있는지 확인해 주세요.
          </>
        ),
      },
      {
        q: 'iPhone에서도 알림을 받을 수 있나요?',
        a: 'iOS에서는 Safari에서 Remindue를 홈 화면에 추가한 뒤, 홈 화면의 앱으로 실행해 알림 권한을 허용해야 합니다. 기기와 iOS 버전에 따라 동작이 다를 수 있어, 알림 권한이 정상적으로 켜졌는지 확인해 주세요.',
      },
    ],
  },
  {
    label: '개인정보·요금제',
    items: [
      {
        q: '전달한 이메일 내용은 어떻게 처리되나요?',
        a: '주문 정보를 추출하기 위해 이메일 제목과 본문을 Claude API(Anthropic)로 처리합니다. 원본 이메일 본문은 처리 후 저장하지 않으며, 서비스에는 추출한 상품명·날짜·금액 등 등록에 필요한 정보만 저장됩니다.',
      },
      {
        q: '무료 플랜과 프리미엄 플랜의 차이는 무엇인가요?',
        a: '무료 플랜은 최대 5개 항목을 등록할 수 있습니다. 프리미엄에서는 등록 개수 제한 없이 이용할 수 있고, 주간 요약, 알림 시점 설정, CSV/PDF 내보내기, 가족 공유 등 추가 기능을 제공합니다. 최신 구성과 가격은 요금제 페이지에서 확인해 주세요.',
      },
      {
        q: '해지 또는 환불은 어떻게 하나요?',
        a: (
          <>
            <Link to="/settings">설정</Link>에서 자동 결제를 해지할 수 있습니다. 환불이 필요하거나 결제 관련 도움이 필요하면 <Link to="/feedback">문의 게시판</Link> 또는 <a href="mailto:ionjk2879@gmail.com">ionjk2879@gmail.com</a>으로 연락해 주세요. 자세한 기준은 <Link to="/terms">이용약관</Link>에서 확인할 수 있습니다.
          </>
        ),
      },
    ],
  },
  {
    label: '문의·피드백',
    items: [
      {
        q: '버그를 발견했거나 기능을 제안하고 싶어요.',
        a: (
          <>
            <Link to="/feedback">문의 게시판</Link>에 남겨 주세요. 버그, 기능 요청, 질문 등으로 분류해 작성할 수 있으며, 확인 후 답변드리겠습니다.
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="faq-page">
      <h1 className="faq-page__title">자주 묻는 질문</h1>

      {FAQ.map((cat, ci) => (
        <section key={ci} className="faq-category">
          <h2 className="faq-category__title">{cat.label}</h2>
          <div className="faq-list-items">
            {cat.items.map((item, ii) => {
              const key = `${ci}-${ii}`;
              const open = openKeys.has(key);
              return (
                <div key={ii} className={`faq-item${open ? ' faq-item--open' : ''}`}>
                  <button
                    type="button"
                    className="faq-item__q"
                    onClick={() => toggle(key)}
                    aria-expanded={open}
                  >
                    <span>{item.q}</span>
                    <svg
                      className="faq-item__chevron"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {open && <div className="faq-item__a">{item.a}</div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

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
    label: '서비스 개요',
    items: [
      {
        q: 'Remindue는 어떤 서비스인가요?',
        a: (
          <>
            정기배송·정기구독을 한곳에서 관리하는 게 핵심 서비스입니다. 여러 브랜드(생수, 밀키트,
            사료 등)에 흩어진 정기배송 스케줄을 한 화면에서 확인할 수 있어요. 가전제품 보증기간,
            온라인 주문 반품기한 관리는 함께 제공되는 보조 기능입니다.
          </>
        ),
      },
    ],
  },
  {
    label: 'AI 자동등록의 한계',
    items: [
      {
        q: '이메일/사진으로 등록하면 항상 정확한가요?',
        a: (
          <>
            아니요. AI가 원본 문서(이메일, 영수증, 스크린샷)에서 텍스트를 읽어 추정하는
            방식이라, 원본에 없는 정보는 만들어낼 수 없습니다. 등록 전 "확인 대기" 화면에서
            반드시 내용을 확인하고 등록해주세요.
          </>
        ),
      },
      {
        q: '반품기한이 왜 "추정치"라고 나오나요?',
        a: (
          <>
            결제 대행 메일(네이버페이 등)에는 반품기한이 명시되지 않는 경우가 많습니다. 이런
            경우 전자상거래법상 최소 보장 기간(7일)으로 추정해서 표시하며, 실제 정확한 기한은
            구매처의 주문내역 페이지에서 직접 확인하시는 걸 권장합니다.
          </>
        ),
      },
      {
        q: '보증기간을 왜 직접 입력해야 하나요?',
        a: (
          <>
            영수증에는 보증기간(예: 12개월)이 명시되지 않는 경우가 대부분입니다. Remindue는
            상품 페이지를 자동으로 크롤링해서 보증 정보를 가져오지 않으며(로그인 필요 페이지
            접근 불가, 사이트마다 다른 구조로 인한 기술적 한계), 이 부분은 구매 시 안내받은
            보증기간을 직접 입력해주셔야 정확합니다.
          </>
        ),
      },
      {
        q: '정기배송 자동등록은 왜 다른 것보다 더 정확한가요?',
        a: (
          <>
            정기구독·배송 확인 메일에는 결제주기·다음 결제일(또는 갱신일)이 명확히 적혀있는
            경우가 많아, AI가 상대적으로 정확하게 인식할 수 있습니다. 이게 Remindue가 정기구독·
            배송 자동등록에 집중하는 이유입니다.
          </>
        ),
      },
    ],
  },
  {
    label: '개인정보 · 보안',
    items: [
      {
        q: '전달한 이메일 내용은 어떻게 처리되나요?',
        a: (
          <>
            AI가 상품명·날짜 등 필요한 정보만 추출하고, 원본 이메일 본문은 저장하지 않고
            즉시 폐기합니다. 수령인 이름, 전화번호, 주소 같은 개인정보는 추출 대상에서
            제외됩니다.
          </>
        ),
      },
      {
        q: '제 데이터는 외부에 공유되나요?',
        a: (
          <>
            텍스트·이미지 분석을 위해 Claude API(Anthropic)로 전송되며, 이는 서비스 제공을
            위한 처리위탁이지 제3자 제공이 아닙니다. 그 외 목적으로 데이터를 공유하지
            않습니다. 자세한 내용은{' '}
            <Link to="/privacy">개인정보처리방침</Link>을 참고해주세요.
          </>
        ),
      },
    ],
  },
  {
    label: '요금제',
    items: [
      {
        q: '무료 플랜과 프리미엄의 차이는?',
        a: (
          <table className="pricing-table faq-pricing-table">
            <thead>
              <tr>
                <th>항목</th>
                <th>무료</th>
                <th>프리미엄</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>등록 개수</td><td>5개</td><td>무제한</td></tr>
              <tr><td>이번 주 배송 요약</td><td>X</td><td>O</td></tr>
              <tr><td>커스텀 알림 시점</td><td>7/3/1/당일 고정</td><td>직접 설정</td></tr>
              <tr><td>CSV/PDF 내보내기</td><td>X</td><td>O</td></tr>
              <tr><td>가족/구성원 공유</td><td>X</td><td>O</td></tr>
              <tr><td>이력 보관(아카이브)</td><td>X</td><td>O</td></tr>
            </tbody>
          </table>
        ),
      },
      {
        q: '정기결제는 언제든 해지할 수 있나요?',
        a: (
          <>
            네, <Link to="/settings">설정 페이지</Link>에서 언제든 해지 가능하며, 이미 결제된
            기간까지는 프리미엄 혜택이 유지됩니다.
          </>
        ),
      },
      {
        q: '환불 규정은 어떻게 되나요?',
        a: (
          <>
            결제 후 7일 이내이고 프리미엄 기능을 사용하지 않은 경우, 전액 환불을 요청하실 수
            있습니다. 환불 요청은{' '}
            <Link to="/feedback">문의 게시판</Link> 또는{' '}
            <a href="mailto:ionjk2879@gmail.com">ionjk2879@gmail.com</a>으로 연락해주세요.
            정확한 환불 정책은 <Link to="/terms">이용약관</Link>을 참고해주세요.
          </>
        ),
      },
    ],
  },
  {
    label: '알림',
    items: [
      {
        q: '알림이 안 와요, 왜 그런가요?',
        a: (
          <>
            웹 푸시는 브라우저·기기별로 별도 설정이 필요합니다. 아래 사항을 순서대로
            확인해주세요.
            <ol className="faq-list">
              <li>브라우저 주소창 좌측 자물쇠 아이콘 → 알림 권한이 "허용"인지 확인</li>
              <li>정확한 도메인(<strong>remindue.kr</strong>)에서 권한을 허용했는지 확인</li>
              <li>기기의 시스템 알림 설정에서 브라우저 알림이 켜져 있는지 확인</li>
            </ol>
            권한을 허용 후에도 오지 않는다면{' '}
            <Link to="/feedback">문의 게시판</Link>에 남겨주세요.
          </>
        ),
      },
      {
        q: 'iOS(아이폰)에서도 알림이 오나요?',
        a: (
          <>
            아직 실기기 검증이 완료되지 않았습니다. 표준 Web Push API 기준으로는 iOS 16.4
            이상에서 동작해야 하나, 확인이 더 필요한 상태입니다. iOS에서 알림을 받으려면
            Safari에서 Remindue를 홈 화면에 추가한 뒤 해당 앱에서 알림 권한을 허용해야 합니다.
          </>
        ),
      },
    ],
  },
  {
    label: '문의 · 피드백',
    items: [
      {
        q: '버그를 발견했거나 기능 제안을 하고 싶어요',
        a: (
          <>
            <Link to="/feedback">문의 게시판</Link>에 남겨주세요. 로그인 후 이용 가능하며,
            버그·기능 요청·질문 카테고리로 나눠 제출하실 수 있습니다. 최대한 빠르게
            확인하겠습니다.
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

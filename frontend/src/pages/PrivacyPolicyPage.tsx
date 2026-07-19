const EFFECTIVE_DATE = '2026-07-19';
const CONTACT_EMAIL = 'ionjk2879@gmail.com';

export default function PrivacyPolicyPage() {
  return (
    <div className="legal-page">
      <h1>개인정보처리방침</h1>
      <p className="legal-page__updated">시행일자: {EFFECTIVE_DATE}</p>

      <p className="legal-page__intro">
        Remindue(이하 "서비스")는 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 이 방침은 서비스가 어떤
        개인정보를 어떤 목적으로 수집·이용·보관하는지 안내합니다.
      </p>

      <section className="legal-section">
        <h2>1. 수집하는 개인정보 항목 및 수집 방법</h2>
        <table className="legal-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>수집 항목</th>
              <th>수집 방법</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>회원가입</td>
              <td>이메일, 비밀번호(암호화 저장), 닉네임</td>
              <td>이용자 직접 입력</td>
            </tr>
            <tr>
              <td>등록 항목(전자제품/온라인주문/정기배송)</td>
              <td>항목명, 구매·주문일, 금액, 메모, 보증기간, 반품기한, 배송주기 등</td>
              <td>이용자 직접 입력</td>
            </tr>
            <tr>
              <td>이메일 자동 등록(포워딩)</td>
              <td>전달된 주문확인 메일의 제목·본문(상품명·날짜 추출 목적)</td>
              <td>이용자가 지정 주소로 메일 전달</td>
            </tr>
            <tr>
              <td>결제(프리미엄)</td>
              <td>결제 플랜, 결제 금액, 결제 일시, 결제 성공/실패 여부</td>
              <td>토스페이먼츠 결제 시스템 연동 (카드번호 등 결제수단 정보 자체는 서비스가 저장하지 않음)</td>
            </tr>
            <tr>
              <td>웹 푸시 알림</td>
              <td>브라우저 푸시 구독 정보(endpoint, 암호화 키)</td>
              <td>이용자의 알림 수신 동의 시 브라우저가 생성</td>
            </tr>
            <tr>
              <td>구성원 공유</td>
              <td>초대한 상대방의 이메일 주소</td>
              <td>이용자 직접 입력</td>
            </tr>
            <tr>
              <td>서비스 이용 과정</td>
              <td>접속 로그, 오류 로그</td>
              <td>서비스 이용 과정에서 자동 생성(호스팅 인프라)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="legal-section">
        <h2>2. 개인정보의 수집 및 이용 목적</h2>
        <ul>
          <li>회원 식별 및 로그인, 계정 관리</li>
          <li>등록한 항목의 기한(D-day) 계산 및 알림(이메일·웹 푸시) 발송</li>
          <li>전달받은 주문확인 메일에서 상품명·날짜를 추출해 "확인 대기" 목록에 자동 등록</li>
          <li>프리미엄 결제 처리 및 구독 상태 관리</li>
          <li>구성원 공유 초대 및 수락 처리</li>
          <li>서비스 장애 대응 및 부정 이용 방지</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>3. 개인정보의 처리 및 보유 기간</h2>
        <p>
          원칙적으로 회원탈퇴 시 이용자의 개인정보를 지체 없이 파기합니다. 설정 화면의 "회원탈퇴"를 통해 언제든 직접 탈퇴할 수 있으며, 탈퇴 시
          등록 항목·결제 내역·공유 정보를 포함한 모든 개인정보가 즉시 삭제됩니다.
        </p>
        <p>
          다만 「전자상거래 등에서의 소비자보호에 관한 법률」 등 관계 법령에서 별도로 보존 기간을 정한 경우 그 기간 동안 보관될 수 있습니다(예: 대금
          결제 및 재화 등의 공급에 관한 기록 5년).
        </p>
      </section>

      <section className="legal-section">
        <h2>4. 개인정보의 제3자 제공</h2>
        <p>서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 아래의 경우는 예외로 합니다.</p>
        <ul>
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>5. 개인정보 처리 위탁</h2>
        <p>서비스는 원활한 업무 처리를 위해 아래와 같이 개인정보 처리를 위탁하고 있습니다.</p>
        <table className="legal-table">
          <thead>
            <tr>
              <th>수탁 업체</th>
              <th>위탁 업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Anthropic (Claude API)</td>
              <td>전달받은 주문확인 메일에서 상품명·날짜 추출 — 처리 후 메일 원본은 저장하지 않음</td>
            </tr>
            <tr>
              <td>토스페이먼츠</td>
              <td>프리미엄 결제 승인 및 정기결제(빌링) 처리</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>알림·안내 이메일 발송</td>
            </tr>
            <tr>
              <td>Cloudflare</td>
              <td>서버(Workers) 및 데이터베이스 호스팅</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="legal-section">
        <h2>6. 정보주체의 권리·의무 및 행사 방법</h2>
        <p>이용자는 언제든지 아래 권리를 행사할 수 있습니다.</p>
        <ul>
          <li>등록한 항목의 열람·정정·삭제 (대시보드에서 직접 수정/삭제/보관)</li>
          <li>회원 탈퇴를 통한 전체 개인정보 삭제 (설정 &gt; 회원탈퇴)</li>
          <li>그 외 문의는 아래 연락처로 요청할 수 있습니다.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>7. 개인정보의 파기 절차 및 방법</h2>
        <p>
          보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일 형태로 저장된 정보는 복구할 수 없는 방법으로
          영구 삭제합니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>8. 쿠키 등 자동 수집 장치</h2>
        <p>
          서비스는 로그인 상태 유지를 위해 브라우저의 localStorage에 접근 토큰을 저장합니다. 이는 서버로 전송되는 쿠키가 아니라 브라우저에만
          저장되는 정보이며, 로그아웃하거나 브라우저 데이터를 삭제하면 함께 제거됩니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>9. 개인정보 보호책임자</h2>
        <p>
          개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등을 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
        </p>
        <p className="mono">이메일: {CONTACT_EMAIL}</p>
      </section>

      <section className="legal-section">
        <h2>10. 고지의 의무</h2>
        <p>이 방침의 내용이 변경되는 경우 서비스 내 공지를 통해 사전에 안내합니다.</p>
      </section>
    </div>
  );
}

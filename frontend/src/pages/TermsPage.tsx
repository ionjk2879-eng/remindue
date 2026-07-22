const EFFECTIVE_DATE = '2026-07-22';
const COMPANY_NAME = '지오스트컴퍼니';
const BIZ_NUMBER = '467-27-02116';
const CONTACT_EMAIL = 'ionjk2879@gmail.com';

export default function TermsPage() {
  return (
    <div className="legal-page">
      <h1>이용약관</h1>
      <p className="legal-page__updated">시행일자: {EFFECTIVE_DATE}</p>

      <section className="legal-section">
        <h2>제1조 (목적)</h2>
        <p>
          이 약관은 {COMPANY_NAME}(이하 "회사")가 운영하는 Remindue 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 등을 규정함을 목적으로 합니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>제2조 (정의)</h2>
        <ul>
          <li>"서비스"란 회사가 제공하는 보증기간·반품기한·정기배송 일정 관리 웹 애플리케이션 Remindue를 의미합니다.</li>
          <li>"이용자"란 이 약관에 동의하고 서비스에 가입한 자를 의미합니다.</li>
          <li>"프리미엄 이용권"이란 이용자가 유료 결제를 통해 구매하는 서비스의 유료 기능 이용 자격을 의미합니다.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>제3조 (서비스 이용)</h2>
        <ol>
          <li>이용자는 이메일과 비밀번호를 등록하여 회원으로 가입한 후 서비스를 이용할 수 있습니다.</li>
          <li>무료 플랜은 최대 5개 항목을 등록할 수 있으며, 이 외 기능은 프리미엄 이용권 구매 후 이용 가능합니다.</li>
          <li>회사는 서비스의 안정적인 운영을 위해 사전 고지 후 서비스 내용을 변경하거나 중단할 수 있습니다.</li>
        </ol>
      </section>

      <section className="legal-section">
        <h2>제4조 (유료 서비스)</h2>
        <p>프리미엄 이용권의 종류와 금액은 아래와 같습니다.</p>
        <table className="legal-table">
          <thead>
            <tr>
              <th>상품</th>
              <th>금액</th>
              <th>이용 기간</th>
              <th>자동 갱신</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1회성 이용권</td>
              <td>2,200원</td>
              <td>30일</td>
              <td>없음</td>
            </tr>
            <tr>
              <td>월 정기결제</td>
              <td>1,900원 / 월</td>
              <td>1개월</td>
              <td>매월 자동 결제</td>
            </tr>
            <tr>
              <td>연 정기결제</td>
              <td>19,000원 / 년</td>
              <td>1년</td>
              <td>매년 자동 결제</td>
            </tr>
          </tbody>
        </table>
        <ol>
          <li>정기결제는 이용자가 해지하기 전까지 매 결제일에 자동으로 청구됩니다.</li>
          <li>정기결제 해지 시 이미 결제된 기간까지 서비스가 유지되며, 이후 자동 청구가 중단됩니다.</li>
          <li>가격은 회사 사정에 따라 변경될 수 있으며, 변경 전 30일 이상 사전 고지합니다.</li>
        </ol>
      </section>

      <section className="legal-section">
        <h2>제5조 (청약철회 및 환불)</h2>
        <ol>
          <li>
            이용자는 결제일로부터 7일 이내에 청약철회를 요청할 수 있습니다.
            단, 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항에 따라 다음의 경우 청약철회가 제한될 수 있습니다.
            <ul>
              <li>이용자가 서비스를 실제로 사용한 경우(로그인하여 항목 등록, 알림 수신 등 프리미엄 기능을 사용한 경우)</li>
            </ul>
          </li>
          <li>
            환불 가능한 경우 결제 수단으로 환불하며, 환불 요청은 {CONTACT_EMAIL}로 문의하시기 바랍니다.
          </li>
          <li>
            정기결제의 경우 해지 후 남은 기간에 대한 일할 환불은 제공하지 않으며, 결제일로부터 7일 이내 미사용 상태에 한해 해당 회차 금액을 환불합니다.
          </li>
          <li>
            서비스 장애 또는 회사 귀책사유로 인한 서비스 중단의 경우 피해 기간에 비례하여 환불 또는 이용 기간 연장 등의 보상을 제공합니다.
          </li>
        </ol>
      </section>

      <section className="legal-section">
        <h2>제6조 (개인정보 보호)</h2>
        <p>
          회사는 관련 법령에 따라 이용자의 개인정보를 보호합니다. 개인정보의 수집·이용·보관에 관한 사항은{' '}
          <a href="/privacy">개인정보처리방침</a>에서 확인하실 수 있습니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>제7조 (면책조항)</h2>
        <ol>
          <li>회사는 천재지변, 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
          <li>이용자가 서비스 내에 등록한 정보의 정확성에 대한 책임은 이용자에게 있습니다.</li>
          <li>서비스는 반품기한·보증기간 등의 정보를 편의상 제공하는 것이며, 실제 법적 효력은 각 판매처·제조사의 정책에 따릅니다.</li>
        </ol>
      </section>

      <section className="legal-section">
        <h2>제8조 (준거법 및 분쟁해결)</h2>
        <p>
          이 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련한 분쟁은 민사소송법상 관할 법원을 통해 해결합니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>사업자 정보</h2>
        <table className="legal-table">
          <tbody>
            <tr><td>상호명</td><td>{COMPANY_NAME}</td></tr>
            <tr><td>사업자등록번호</td><td>{BIZ_NUMBER}</td></tr>
            <tr><td>고객센터</td><td>{CONTACT_EMAIL}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

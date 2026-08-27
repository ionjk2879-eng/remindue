const EFFECTIVE_DATE = '2026-08-27';
const CONTACT_EMAIL = 'ionjk2879@gmail.com';

export default function TermsPage() {
  return (
    <div className="legal-page">
      <h1>이용약관</h1>
      <p className="legal-page__updated">시행일자: {EFFECTIVE_DATE}</p>

      <section className="legal-section">
        <h2>제1조 (목적)</h2>
        <p>
          이 약관은 운영자가 개인적으로 운영하는 Remindue 서비스(이하 "서비스")의 이용 조건 및 절차, 운영자와 이용자 간의 권리·의무 등을 규정함을 목적으로 합니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>제2조 (정의)</h2>
        <ul>
          <li>"서비스"란 운영자가 제공하는 보증기간·반품기한·정기배송 일정 관리 웹 애플리케이션 Remindue를 의미합니다.</li>
          <li>"이용자"란 이 약관에 동의하고 서비스에 가입한 자를 의미합니다.</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2>제3조 (서비스 이용)</h2>
        <ol>
          <li>이용자는 Google 계정으로 로그인하여 서비스를 이용할 수 있습니다.</li>
          <li>서비스는 사업자가 아닌 개인이 비영리로 운영하며, 유료 결제나 구독 기능을 제공하지 않습니다.</li>
          <li>운영자는 서비스의 안정적인 운영을 위해 사전 고지 후 서비스 내용을 변경하거나 중단할 수 있습니다.</li>
        </ol>
      </section>

      <section className="legal-section">
        <h2>제4조 (개인정보 보호)</h2>
        <p>
          운영자는 관련 법령에 따라 이용자의 개인정보를 보호합니다. 개인정보의 수집·이용·보관에 관한 사항은{' '}
          <a href="/privacy">개인정보처리방침</a>에서 확인하실 수 있습니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>제5조 (면책조항)</h2>
        <ol>
          <li>운영자는 천재지변, 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
          <li>이용자가 서비스 내에 등록한 정보의 정확성에 대한 책임은 이용자에게 있습니다.</li>
          <li>서비스는 반품기한·보증기간 등의 정보를 편의상 제공하는 것이며, 실제 법적 효력은 각 판매처·제조사의 정책에 따릅니다.</li>
        </ol>
      </section>

      <section className="legal-section">
        <h2>제6조 (준거법 및 분쟁해결)</h2>
        <p>
          이 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련한 분쟁은 민사소송법상 관할 법원을 통해 해결합니다.
        </p>
      </section>

      <section className="legal-section">
        <h2>문의</h2>
        <p className="mono">이메일: {CONTACT_EMAIL}</p>
      </section>
    </div>
  );
}

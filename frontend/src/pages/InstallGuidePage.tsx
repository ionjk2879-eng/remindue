export default function InstallGuidePage() {
  return (
    <div className="legal-page install-guide">
      <h1>Remindue 설치하기</h1>
      <p className="legal-page__intro">
        다운로드 없이 홈 화면에 아이콘만 추가해도 앱처럼 쓸 수 있어요(PWA). Android라면 푸시 알림 등
        네이티브 기능까지 포함한 베타 앱을 직접 설치해볼 수도 있습니다 — 아직 스토어에 올리기 전이라
        설치 파일을 이 페이지에서 바로 받아야 해요.
      </p>

      <section className="install-guide__section">
        <h2>💻 PC에서 설치 (PWA)</h2>
        <p>Chrome, Edge 등 최신 데스크톱 브라우저에서 지원해요.</p>
        <ol>
          <li>주소창 오른쪽의 설치 아이콘( ⊕ 또는 모니터 모양 아이콘)을 클릭하세요.</li>
          <li>안 보이면 브라우저 메뉴(⋮) → <strong>"Remindue 설치"</strong>를 선택하세요.</li>
        </ol>
        <p className="install-guide__note">설치하면 독립된 창으로 열리고, 작업표시줄/독에 아이콘이 생겨요.</p>
      </section>

      <section className="install-guide__section">
        <h2>📱 모바일에서 홈 화면에 추가 (PWA)</h2>
        <p>다운로드 없이 아이콘 하나로 바로 열 수 있고, 항상 최신 버전이 자동으로 반영돼요.</p>
        <h3>iOS (Safari)</h3>
        <ol>
          <li>하단 공유 아이콘을 탭하세요.</li>
          <li><strong>홈 화면에 추가</strong>를 선택하세요.</li>
        </ol>
        <h3>Android (Chrome)</h3>
        <ol>
          <li>브라우저 메뉴(⋮)를 탭하세요.</li>
          <li><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택하세요.</li>
        </ol>
      </section>

      <section className="install-guide__section">
        <h2>🤖 Android 앱 다운로드 (베타)</h2>
        <p>푸시 알림 등 네이티브 기능까지 포함한 베타 버전이에요. 아직 스토어에 올리기 전이라 설치 파일을 직접 내려받아야 해요.</p>
        <a className="btn" href="/downloads/remindue.apk" download>
          APK 다운로드
        </a>
        <p className="install-guide__note">
          PC에서 이 페이지를 보고 있다면, 이 링크를 폰으로 보내거나 폰 브라우저로 이 페이지를 열어서 받아주세요.
          설치할 때 "출처를 알 수 없는 앱" 허용이 필요할 수 있어요. 베타 버전이라 예고 없이 자주 바뀔 수 있어요.
        </p>
      </section>
    </div>
  );
}

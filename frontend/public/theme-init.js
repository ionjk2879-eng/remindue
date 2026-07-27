(function () {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (error) {
    // 저장소 접근이 차단된 브라우저에서는 시스템 테마를 그대로 사용한다.
  }
})();

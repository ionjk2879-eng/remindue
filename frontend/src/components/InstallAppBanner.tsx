import { useEffect, useState } from 'react';
import { isNative } from '../lib/native';

type MobilePlatform = 'android' | 'ios';

function detectPlatform(): MobilePlatform | null {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return null;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const DISMISS_KEY = 'installBannerDismissed';

/**
 * 모바일 브라우저로 접속했을 때만 노출 — PWA(홈 화면 추가)와 네이티브 앱(APK 직접 설치)
 * 두 경로를 헷갈리지 않게 분리해서 안내한다. 네이티브 앱은 아직 스토어에 게시되지 않아
 * "스토어에서 받기"가 아니라 APK 파일을 직접 내려받는 방식으로 안내한다.
 */
export default function InstallAppBanner() {
  const [platform, setPlatform] = useState<MobilePlatform | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (isNative || isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return;
    setPlatform(detectPlatform());
  }, []);

  if (!platform) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setPlatform(null);
  };

  return (
    <>
      <div className="install-banner">
        <span className="install-banner__text">📱 앱처럼 더 편하게 써보세요</span>
        <div className="install-banner__actions">
          <button type="button" className="btn btn-sm" onClick={() => setShowModal(true)}>
            설치 방법 보기
          </button>
          <button type="button" className="btn-text" onClick={dismiss} aria-label="닫기">
            ✕
          </button>
        </div>
      </div>

      {showModal && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
          <div className="install-modal">
            <h2 id="install-modal-title" className="install-modal__title">Remindue 설치하기</h2>

            <section className="install-modal__section">
              <h3>홈 화면에 추가 (PWA)</h3>
              <p>다운로드 없이 아이콘 하나로 바로 열 수 있어요. 항상 최신 버전이 자동으로 반영돼요.</p>
              {platform === 'ios' ? (
                <ol>
                  <li>하단 공유 아이콘 탭</li>
                  <li><strong>홈 화면에 추가</strong> 선택</li>
                </ol>
              ) : (
                <ol>
                  <li>브라우저 메뉴(⋮) 탭</li>
                  <li><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong> 선택</li>
                </ol>
              )}
            </section>

            {platform === 'android' && (
              <section className="install-modal__section">
                <h3>Android 앱 다운로드 (베타)</h3>
                <p>푸시 알림 등 네이티브 기능까지 포함한 베타 버전이에요. 아직 스토어에 올리기 전이라 설치 파일을 직접 내려받아야 해요.</p>
                <a className="btn btn-sm" href="/downloads/remindue.apk" download>
                  APK 다운로드
                </a>
                <p className="install-modal__note">
                  설치할 때 "출처를 알 수 없는 앱" 허용이 필요할 수 있어요. 베타 버전이라 예고 없이 자주 바뀔 수 있어요.
                </p>
              </section>
            )}

            <button type="button" className="btn-text install-modal__close" onClick={() => setShowModal(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}

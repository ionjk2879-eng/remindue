import { useEffect, useState } from 'react';
import { fetchVapidPublicKey, subscribePush } from '../api/push';
import { isPushSupported, urlBase64ToUint8Array } from '../lib/push';

/**
 * 이미 거부했거나(denied) 실제 구독이 이미 있으면 조용히 숨는다 — 매번 다시 묻지 않는다.
 * 권한이 'default'인지는 안 본다 — 안드로이드에서 PWA를 홈 화면에 설치할 때 Chrome/OS가
 * 설치 흐름 중에 알림 권한을 자체적으로 먼저 'granted'로 넘겨버리는 경우가 있는데, 그때도
 * 실제 pushManager 구독은 아직 안 만들어진 상태일 수 있다 — 그 경우 이 배너가 유일하게
 * subscribePush()를 호출해서 서버에 등록해줄 수 있는 통로라, 권한이 이미 허용돼 있어도
 * 구독이 없으면 반드시 보여줘야 한다.
 */
export default function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported() || Notification.permission === 'denied') return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (existing) => {
        if (!existing) {
          setVisible(true);
          return;
        }

        // 브라우저에는 구독이 남아 있어도 서버 DB에서 만료/삭제됐을 수 있다.
        // 로그인한 계정에 현재 구독을 다시 upsert해 테스트 알림이 "구독 없음"으로
        // 끝나지 않도록 페이지 진입 시 동기화한다.
        try {
          await subscribePush(existing.toJSON());
          setVisible(false);
        } catch {
          setVisible(true);
        }
      })
      .catch(() => setVisible(true));
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setVisible(false);
        return;
      }

      const publicKey = await fetchVapidPublicKey();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await subscribePush(subscription.toJSON());
      setVisible(false);
    } catch (err) {
      setError('알림 설정에 실패했습니다. 다시 시도해주세요.');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="push-banner">
      <span className="push-banner__text">놓치기 쉬운 기한, 브라우저 알림으로 바로 받아보세요.</span>
      <div className="push-banner__actions">
        {error && <span className="push-banner__error">{error}</span>}
        <button className="btn btn-sm" onClick={handleEnable} disabled={busy}>
          {busy ? '설정 중…' : '알림 받기'}
        </button>
      </div>
    </div>
  );
}

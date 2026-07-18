import { useEffect, useState } from 'react';
import { fetchVapidPublicKey, subscribePush } from '../api/push';
import { isPushSupported, urlBase64ToUint8Array } from '../lib/push';

/** 이미 허용(또는 거부)했거나 구독이 이미 있으면 조용히 숨는다 — 매번 다시 묻지 않는다. */
export default function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported() || Notification.permission !== 'default') return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setVisible(!existing))
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

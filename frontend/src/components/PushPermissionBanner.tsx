import { useEffect, useState } from 'react';
import { ensurePushSubscription } from '../api/push';
import { getNotificationPermission, isPushSupported } from '../lib/push';

/** 브라우저 알림 권한과 서버의 푸시 구독을 동기화하는 안내 배너. */
export default function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) return;

    let active = true;
    const sync = async () => {
      const currentPermission = await getNotificationPermission();
      if (!active) return;

      if (currentPermission !== 'granted') {
        setVisible(true);
        return;
      }

      try {
        await ensurePushSubscription();
        if (active) setVisible(false);
      } catch {
        if (active) setVisible(true);
      }
    };

    void sync();
    let permissionStatus: PermissionStatus | undefined;
    void navigator.permissions?.query({ name: 'notifications' }).then((status) => {
      if (!active) return;
      permissionStatus = status;
      status.addEventListener('change', sync);
    }).catch(() => undefined);
    window.addEventListener('focus', sync);
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      active = false;
      permissionStatus?.removeEventListener('change', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pageshow', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await ensurePushSubscription(true);
      const currentPermission = await getNotificationPermission();
      if (!subscription) {
        setVisible(true);
        setError(currentPermission === 'denied'
          ? '브라우저 사이트 설정에서 알림을 허용한 뒤 이 화면으로 돌아와 주세요.'
          : '알림 권한을 허용해야 알림을 받을 수 있어요.');
        return;
      }
      setVisible(false);
    } catch (err) {
      setError('알림 설정에 실패했습니다. 다시 시도해 주세요.');
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
          {busy ? '설정 중…' : '알림 허용 받기'}
        </button>
      </div>
    </div>
  );
}

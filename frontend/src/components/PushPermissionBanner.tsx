import { useEffect, useState } from 'react';
import { ensurePushSubscription } from '../api/push';
import { getNotificationPermission, isPushSupported } from '../lib/push';

/** 브라우저 알림 권한과 서버의 푸시 구독을 동기화하는 안내 배너. */
export default function PushPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

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
        setShowPermissionPrompt(false);
        setError(currentPermission === 'denied'
          ? 'Chrome 알림 권한 창에서 허용을 선택해 주세요.'
          : '알림 권한 요청이 완료되지 않았어요. 다시 시도해 주세요.');
        return;
      }
      window.location.reload();
    } catch (err) {
      setShowPermissionPrompt(false);
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
        <button className="btn btn-sm" onClick={() => { setError(null); setShowPermissionPrompt(true); }} disabled={busy}>
          알림 허용 받기
        </button>
      </div>
      {showPermissionPrompt && (
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="push-permission-title">
          <div className="onboarding-modal">
            <p id="push-permission-title" className="onboarding-modal__title">🔔 Remindue 알림을 허용할까요?</p>
            <p className="onboarding-modal__body">
              이어서 표시되는 Chrome 권한 창에서 <strong>허용</strong>을 눌러주세요.
              허용이 완료되면 화면이 새로고침되고 알림이 활성화됩니다.
            </p>
            <div className="onboarding-modal__actions">
              <button type="button" className="btn" disabled={busy} onClick={handleEnable}>
                {busy ? '설정 중…' : '허용하기'}
              </button>
              <button type="button" className="btn-text" disabled={busy} onClick={() => setShowPermissionPrompt(false)}>
                나중에
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

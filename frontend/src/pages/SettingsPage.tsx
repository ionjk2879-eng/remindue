import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { fetchNotificationDays, updateNotificationDays } from '../api/settings';
import { acceptInvite, fetchReceivedInvites, fetchSentInvites, inviteMember, revokeShare } from '../api/sharing';
import { cancelSubscription, fetchBillingStatus } from '../api/billing';
import { useAuth } from '../context/AuthContext';
import type { BillingStatus, SharedAccess } from '../types';

const PLAN_LABEL: Record<'ONE_TIME' | 'MONTHLY' | 'ANNUAL', string> = {
  ONE_TIME: '1회성 이용권',
  MONTHLY: '월 정기결제',
  ANNUAL: '연 정기결제',
};

function formatDateOnly(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/** 백엔드 lib/notification-prefs.ts의 NOTIFICATION_DAY_OPTIONS와 같은 목록 — 설정 화면 체크박스 후보. */
const NOTIFICATION_DAY_OPTIONS = [10, 7, 5, 3, 2, 1, 0];
const FREE_PLAN_FIXED_DAYS = [7, 3, 1, 0];

function formatDayLabel(day: number): string {
  return day === 0 ? '당일' : `${day}일 전`;
}

export default function SettingsPage() {
  const { isPremium } = useAuth();

  const [selectedDays, setSelectedDays] = useState<number[]>(FREE_PLAN_FIXED_DAYS);
  const [savingDays, setSavingDays] = useState(false);
  const [daysMessage, setDaysMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [sentInvites, setSentInvites] = useState<SharedAccess[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<SharedAccess[]>([]);

  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const loadBillingStatus = async () => {
    const data = await fetchBillingStatus();
    setBillingStatus(data);
  };

  const loadNotificationDays = async () => {
    const data = await fetchNotificationDays();
    setSelectedDays(data.notificationDays);
  };

  const loadSharing = async () => {
    const [sent, received] = await Promise.all([fetchSentInvites(), fetchReceivedInvites()]);
    setSentInvites(sent);
    setReceivedInvites(received);
  };

  useEffect(() => {
    loadBillingStatus();
    loadNotificationDays();
    loadSharing();
  }, []);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSaveDays = async () => {
    setDaysMessage(null);
    setSavingDays(true);
    try {
      const result = await updateNotificationDays(selectedDays);
      setSelectedDays(result.notificationDays);
      setDaysMessage('저장했어요.');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setDaysMessage(message ?? '저장하지 못했어요.');
    } finally {
      setSavingDays(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviting(true);
    try {
      await inviteMember(inviteEmail);
      setInviteEmail('');
      await loadSharing();
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setInviteError(message ?? '초대하지 못했어요.');
    } finally {
      setInviting(false);
    }
  };

  const handleAccept = async (id: number) => {
    await acceptInvite(id);
    await loadSharing();
  };

  const handleRevoke = async (id: number) => {
    await revokeShare(id);
    await loadSharing();
  };

  const handleCancelSubscription = async () => {
    const confirmed = window.confirm(
      '해지하면 다음 결제일부터 자동 결제가 중단되고, 이미 결제된 기간까지는 프리미엄이 유지됩니다. 해지할까요?'
    );
    if (!confirmed) return;

    setCancelMessage(null);
    setCancelling(true);
    try {
      const result = await cancelSubscription();
      setBillingStatus(result);
      setCancelMessage('정기결제를 해지했어요. 결제된 기간까지는 프리미엄이 유지됩니다.');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setCancelMessage(message ?? '해지하지 못했어요.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="settings-page">
      <h1>설정</h1>

      {isPremium && billingStatus?.plan && (billingStatus.plan === 'MONTHLY' || billingStatus.plan === 'ANNUAL') && (
        <section className="settings-section">
          <h2>구독 관리</h2>
          <p className="settings-section__hint">
            {PLAN_LABEL[billingStatus.plan]} 이용 중
            {billingStatus.premiumExpiresAt && ` · ${formatDateOnly(billingStatus.premiumExpiresAt)}까지`}
          </p>
          {billingStatus.autoRenew ? (
            <button className="btn btn-sm btn-outline" onClick={handleCancelSubscription} disabled={cancelling}>
              {cancelling ? '해지 중...' : '정기결제 해지'}
            </button>
          ) : (
            <p className="settings-section__hint">자동 결제가 해지됐어요. 남은 기간까지는 프리미엄이 유지됩니다.</p>
          )}
          {cancelMessage && <p className="settings-section__message">{cancelMessage}</p>}
        </section>
      )}

      <section className="settings-section">
        <h2>알림 시점</h2>
        {isPremium ? (
          <>
            <p className="settings-section__hint">D-day가 며칠 남았을 때 알림을 받을지 골라주세요.</p>
            <div className="notification-day-options">
              {NOTIFICATION_DAY_OPTIONS.map((day) => (
                <label key={day} className="notification-day-option">
                  <input type="checkbox" checked={selectedDays.includes(day)} onChange={() => toggleDay(day)} />
                  {formatDayLabel(day)}
                </label>
              ))}
            </div>
            <button className="btn btn-sm" onClick={handleSaveDays} disabled={savingDays || selectedDays.length === 0}>
              {savingDays ? '저장 중...' : '저장'}
            </button>
            {daysMessage && <p className="settings-section__message">{daysMessage}</p>}
          </>
        ) : (
          <p className="settings-section__hint">
            무료 플랜은 7일/3일/1일/당일 전 알림으로 고정돼요.{' '}
            <Link to="/pricing">프리미엄으로 업그레이드하면 원하는 시점을 고를 수 있어요 →</Link>
          </p>
        )}
      </section>

      <section className="settings-section">
        <h2>구성원 공유</h2>
        {isPremium ? (
          <>
            <p className="settings-section__hint">이메일로 초대하면 초대받은 사람이 회원님의 목록을 읽기 전용으로 볼 수 있어요.</p>
            <form className="invite-form" onSubmit={handleInvite}>
              <input
                type="email"
                placeholder="초대할 이메일"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-sm" disabled={inviting}>
                {inviting ? '초대 중...' : '초대하기'}
              </button>
            </form>
            {inviteError && <p className="form-error">{inviteError}</p>}

            {sentInvites.length > 0 && (
              <ul className="invite-list">
                {sentInvites.map((invite) => (
                  <li key={invite.id}>
                    <span>{invite.counterpart}</span>
                    <span className={`invite-status invite-status--${invite.status}`}>
                      {invite.status === 'accepted' ? '수락됨' : '대기중'}
                    </span>
                    <button type="button" className="btn-text" onClick={() => handleRevoke(invite.id)}>
                      취소
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="settings-section__hint">
            구성원 초대는 프리미엄 전용이에요. <Link to="/pricing">업그레이드하기 →</Link>
          </p>
        )}

        {receivedInvites.length > 0 && (
          <div className="received-invites">
            <h3>받은 초대</h3>
            <ul className="invite-list">
              {receivedInvites.map((invite) => (
                <li key={invite.id}>
                  <span>{invite.counterpart}님의 목록</span>
                  {invite.status === 'accepted' ? (
                    <span className="invite-status invite-status--accepted">수락됨</span>
                  ) : (
                    <>
                      <button type="button" className="btn-text" onClick={() => handleAccept(invite.id)}>
                        수락
                      </button>
                      <button type="button" className="btn-text" onClick={() => handleRevoke(invite.id)}>
                        거절
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

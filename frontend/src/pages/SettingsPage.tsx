import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { fetchNotificationDays, updateNotificationDays, updateNickname as apiUpdateNickname } from '../api/settings';
import { acceptInvite, fetchReceivedInvites, fetchSentInvites, inviteMember, revokeShare } from '../api/sharing';
import { cancelSubscription, fetchBillingStatus } from '../api/billing';
import { deleteAccount } from '../api/auth';
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
  const { nickname, isPremium, logout, updateNickname, refreshPremium } = useAuth();
  const navigate = useNavigate();

  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);

  const [selectedDays, setSelectedDays] = useState<number[] | null>(null);
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

  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

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

  const handleNicknameEdit = () => {
    setNicknameInput(nickname ?? '');
    setNicknameMessage(null);
    setNicknameEditing(true);
  };

  const handleNicknameSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setNicknameMessage(null);
    setSavingNickname(true);
    try {
      const result = await apiUpdateNickname(nicknameInput);
      updateNickname(result.nickname);
      setNicknameEditing(false);
      setNicknameMessage('닉네임을 변경했어요.');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setNicknameMessage(message ?? '변경하지 못했어요.');
    } finally {
      setSavingNickname(false);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => (prev === null ? prev : prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSaveDays = async () => {
    if (selectedDays === null) return;
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
      refreshPremium(result);
      setCancelMessage('정기결제를 해지했어요. 결제된 기간까지는 프리미엄이 유지됩니다.');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setCancelMessage(message ?? '해지하지 못했어요.');
    } finally {
      setCancelling(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);

    const confirmed = window.confirm(
      '정말 탈퇴하시겠어요? 등록된 항목, 알림 구독, 공유 정보가 모두 삭제되며 되돌릴 수 없습니다. (결제·구독 기록은 법령에 따라 5년간 별도 보관됩니다)'
    );
    if (!confirmed) return;

    setWithdrawing(true);
    try {
      await deleteAccount(withdrawPassword);
      logout();
      navigate('/');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setWithdrawError(message ?? '탈퇴하지 못했어요.');
      setWithdrawing(false);
    }
  };

  return (
    <div className="settings-page">
      <h1>설정</h1>

      <section className="settings-section">
        <div className="settings-section__header">
          <h2>닉네임</h2>
          {!nicknameEditing && (
            <button type="button" className="btn btn-sm btn-outline" onClick={handleNicknameEdit}>
              변경
            </button>
          )}
        </div>
        {nicknameEditing ? (
          <form className="nickname-form" onSubmit={handleNicknameSave}>
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              maxLength={20}
              required
              autoFocus
              style={{ outline: 'none', boxShadow: 'none' }}
            />
            <div className="nickname-form__actions">
              <button type="submit" className="btn btn-sm" disabled={savingNickname}>
                {savingNickname ? '저장 중...' : '저장'}
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setNicknameEditing(false)} disabled={savingNickname}>
                취소
              </button>
            </div>
          </form>
        ) : (
          <p className="settings-section__hint">{nickname}</p>
        )}
        {nicknameMessage && <p className="settings-section__message">{nicknameMessage}</p>}
      </section>

      <section className="settings-section">
        <div className="settings-section__header">
          <h2>구독 관리</h2>
          {billingStatus !== null && (
            isPremium && billingStatus.plan && (billingStatus.plan === 'MONTHLY' || billingStatus.plan === 'ANNUAL') ? (
              !billingStatus.autoRenew && <Link to="/pricing" className="btn btn-sm">다시 구독하기</Link>
            ) : (
              <Link to="/pricing" className="btn btn-sm">프리미엄 구독하기</Link>
            )
          )}
        </div>
        {isPremium && billingStatus?.plan && (billingStatus.plan === 'MONTHLY' || billingStatus.plan === 'ANNUAL') ? (
          <>
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
          </>
        ) : (
          !isPremium && <p className="settings-section__hint">현재 무료 플랜이에요.</p>
        )}
      </section>

      <section className="settings-section">
        <h2>알림 시점</h2>
        {isPremium ? (
          selectedDays === null ? null : (
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
          )
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

      <section className="settings-section settings-section--danger">
        <h2>회원탈퇴</h2>
        <p className="settings-section__hint">
          탈퇴하면 등록된 항목, 알림 구독, 공유 정보가 모두 삭제되고 되돌릴 수 없어요. 단, 결제·구독 기록은
          전자상거래법에 따라 계정과 분리되어 5년간 보관됩니다.
          {isPremium && ' 진행 중인 정기결제가 있다면 먼저 위에서 해지해주세요.'}
        </p>
        <form className="withdraw-form" onSubmit={handleWithdraw}>
          <input
            type="password"
            placeholder="비밀번호 확인"
            value={withdrawPassword}
            onChange={(e) => setWithdrawPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-sm btn-danger" disabled={withdrawing}>
            {withdrawing ? '탈퇴 중...' : '회원탈퇴'}
          </button>
        </form>
        {withdrawError && <p className="form-error">{withdrawError}</p>}
      </section>
    </div>
  );
}

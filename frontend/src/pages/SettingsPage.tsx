import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  fetchNotificationDays,
  updateNotificationDays,
  updateRenewalNotificationDays,
  updateNickname as apiUpdateNickname,
} from '../api/settings';
import { acceptInvite, fetchReceivedInvites, fetchSentInvites, inviteMember, revokeShare } from '../api/sharing';
import { cancelSubscription } from '../api/billing';
import { deleteAccount } from '../api/auth';
import { ensurePushSubscription, sendTestPush, type PushTestKind } from '../api/push';
import { useAuth } from '../context/AuthContext';
import Skeleton from '../components/Skeleton';
import type { SharedAccess } from '../types';
import { getNotificationPermission } from '../lib/push';
import { isNative } from '../lib/native';

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
  const { nickname, isPremium, billingStatus, logout, updateNickname, refreshPremium } = useAuth();
  const navigate = useNavigate();

  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);

  const [selectedDays, setSelectedDays] = useState<number[] | null>(null);
  const [savingDays, setSavingDays] = useState(false);
  const [daysMessage, setDaysMessage] = useState<string | null>(null);
  const [renewalSelectedDays, setRenewalSelectedDays] = useState<number[] | null>(null);
  const [savingRenewalDays, setSavingRenewalDays] = useState(false);
  const [renewalDaysMessage, setRenewalDaysMessage] = useState<string | null>(null);
  const [sendingTestPush, setSendingTestPush] = useState<PushTestKind | null>(null);
  const [testPushMessage, setTestPushMessage] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [sentInvites, setSentInvites] = useState<SharedAccess[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<SharedAccess[]>([]);

  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const [withdrawPassword, setWithdrawPassword] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const [sharingLoaded, setSharingLoaded] = useState(false);

  const loadNotificationDays = async () => {
    const data = await fetchNotificationDays();
    setSelectedDays(data.notificationDays);
    setRenewalSelectedDays(data.renewalNotificationDays);
  };

  const loadSharing = async () => {
    const [sent, received] = await Promise.all([fetchSentInvites(), fetchReceivedInvites()]);
    setSentInvites(sent);
    setReceivedInvites(received);
    setSharingLoaded(true);
  };

  // billingStatus는 AuthContext가 로그인 시점에 한 번 가져와 캐싱해둔 값을 그대로 재사용한다 —
  // 여기서 따로 /billing/status를 다시 부르지 않는다. 결제/해지 직후에는 각 처리 함수가
  // refreshPremium()으로 context를 갱신한다.
  useEffect(() => {
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

  const toggleNoNotificationDays = () => {
    setSelectedDays((prev) => (prev === null ? prev : []));
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

  const toggleRenewalDay = (day: number) => {
    setRenewalSelectedDays((prev) => (prev === null ? prev : prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSaveRenewalDays = async () => {
    if (renewalSelectedDays === null) return;
    setRenewalDaysMessage(null);
    setSavingRenewalDays(true);
    try {
      const result = await updateRenewalNotificationDays(renewalSelectedDays);
      setRenewalSelectedDays(result.notificationDays);
      setRenewalDaysMessage('저장했어요.');
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setRenewalDaysMessage(message ?? '저장하지 못했어요.');
    } finally {
      setSavingRenewalDays(false);
    }
  };

  const handleSendTestPush = async (kind: PushTestKind) => {
    setTestPushMessage(null);
    setSendingTestPush(kind);
    try {
      // 네이티브 앱은 Web Push(Notification/PushManager) API 자체가 없거나 동작이 달라
      // ensurePushSubscription이 그대로 실패한다 — FCM 토큰 등록은 NativeInitializer가 앱
      // 시작 시 이미 처리하므로, 네이티브에서는 이 단계를 건너뛰고 바로 테스트를 보낸다.
      if (!isNative) {
        const subscription = await ensurePushSubscription(true);
        if (!subscription) {
          setTestPushMessage((await getNotificationPermission()) === 'denied'
            ? '브라우저 사이트 설정에서 알림을 허용한 뒤 다시 시도해 주세요.'
            : '알림 권한을 허용해야 테스트 알림을 보낼 수 있어요.');
          return;
        }
      }
      const { sent } = await sendTestPush(kind);
      setTestPushMessage(`테스트 알림을 ${sent}개 기기에 보냈어요.`);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      setTestPushMessage(message ?? '테스트 알림을 보내지 못했어요.');
    } finally {
      setSendingTestPush(null);
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
        {billingStatus === null ? (
          <div className="skeleton-block">
            <Skeleton width="60%" />
            <Skeleton width="30%" />
          </div>
        ) : isPremium && billingStatus.plan && (billingStatus.plan === 'MONTHLY' || billingStatus.plan === 'ANNUAL') ? (
          <>
            {billingStatus.autoRenew ? (
              <div className="settings-subscription-row">
                <p className="settings-section__hint">
                  {PLAN_LABEL[billingStatus.plan]} 이용 중
                  {billingStatus.premiumExpiresAt && ` · ${formatDateOnly(billingStatus.premiumExpiresAt)}까지`}
                </p>
                <button className="btn btn-sm btn-outline" onClick={handleCancelSubscription} disabled={cancelling}>
                  {cancelling ? '해지 중...' : '정기결제 해지'}
                </button>
              </div>
            ) : (
              <>
                <p className="settings-section__hint">
                  {PLAN_LABEL[billingStatus.plan]} 이용 중
                  {billingStatus.premiumExpiresAt && ` · ${formatDateOnly(billingStatus.premiumExpiresAt)}까지`}
                </p>
                <p className="settings-section__hint">자동 결제가 해지됐어요. 남은 기간까지는 프리미엄이 유지됩니다.</p>
              </>
            )}
            {cancelMessage && <p className="settings-section__message">{cancelMessage}</p>}
          </>
        ) : (
          !isPremium && <p className="settings-section__hint">현재 무료 플랜이에요.</p>
        )}
      </section>

      <section className="settings-section">
        <h2>기한 예정 알림</h2>
        {isPremium ? (
          selectedDays === null ? (
            <div className="skeleton-block">
              <Skeleton width="80%" />
              <Skeleton width="50%" />
            </div>
          ) : (
            <>
              <p className="settings-section__hint">
                반품 기한·A/S 보증이 며칠 남았을 때 요약 알림을 받을지 골라주세요. AI가 주문 정보를 읽어도 실제 반품 기한·A/S 기간까지 정확히 알아내는 데는 한계가 있어, 미입력 항목은 반품 1주·A/S 1년을 기본값으로 적용합니다. 꼭 실제 조건을 확인해 수정해 주세요.
              </p>
              <div className="notification-day-options">
                <label
                  className={`notification-day-option${selectedDays.length === 0 ? ' notification-day-option--active' : ''}`}
                >
                  <input type="checkbox" checked={selectedDays.length === 0} onChange={toggleNoNotificationDays} />
                  없음
                </label>
                {NOTIFICATION_DAY_OPTIONS.map((day) => (
                  <label
                    key={day}
                    className={`notification-day-option${selectedDays.includes(day) ? ' notification-day-option--active' : ''}`}
                  >
                    <input type="checkbox" checked={selectedDays.includes(day)} onChange={() => toggleDay(day)} />
                    {formatDayLabel(day)}
                  </label>
                ))}
              </div>
              <button className="btn btn-sm" onClick={handleSaveDays} disabled={savingDays}>
                {savingDays ? '저장 중...' : '저장'}
              </button>
              {daysMessage && <p className="settings-section__message">{daysMessage}</p>}
            </>
          )
        ) : (
          <>
            <p className="settings-section__hint">무료 플랜의 기본 예정 알림이에요.</p>
            <div className="notification-day-options" aria-label="무료 기한 예정 알림 시점">
              {FREE_PLAN_FIXED_DAYS.map((day) => (
                <label key={day} className="notification-day-option notification-day-option--active">
                  <input type="checkbox" checked readOnly />
                  {formatDayLabel(day)}
                </label>
              ))}
            </div>
            <p className="settings-section__hint"><Link to="/pricing">프리미엄으로 업그레이드하면 원하는 시점을 고를 수 있어요 →</Link></p>
          </>
        )}
      </section>

      <section className="settings-section">
        <h2>정기배송·구독 유지 확인</h2>
        <p className="settings-section__hint">이미 등록된 정기배송·구독의 다음 배송·결제 회차를 기준으로 안내해요. 설정한 D-n일마다 “다음 회차까지 며칠 남았어요. 계속 유지할까요?”라고 묻고, 유지·중단을 선택하면 그 회차의 추가 확인은 멈춰요. 반품·A/S 기한 알림과는 별도 설정입니다.</p>
        {isPremium ? (
          renewalSelectedDays === null ? (
            <div className="skeleton-block"><Skeleton width="80%" /></div>
          ) : (
            <>
              <div className="notification-day-options" aria-label="정기배송과 구독 유지 확인 알림">
                {NOTIFICATION_DAY_OPTIONS.map((day) => (
                  <label
                    key={day}
                    className={`notification-day-option${renewalSelectedDays.includes(day) ? ' notification-day-option--active' : ''}`}
                  >
                    <input type="checkbox" checked={renewalSelectedDays.includes(day)} onChange={() => toggleRenewalDay(day)} />
                    {formatDayLabel(day)}
                  </label>
                ))}
                <label className="notification-day-option notification-day-option--active"><input type="checkbox" checked readOnly />미응답 시 D+7 절약 검토</label>
              </div>
              <button className="btn btn-sm" onClick={handleSaveRenewalDays} disabled={savingRenewalDays || renewalSelectedDays.length === 0}>
                {savingRenewalDays ? '저장 중...' : '저장'}
              </button>
              {renewalDaysMessage && <p className="settings-section__message">{renewalDaysMessage}</p>}
            </>
          )
        ) : (
          <div className="notification-day-options" aria-label="무료 정기배송과 구독 유지 확인 알림">
            <label className="notification-day-option notification-day-option--active"><input type="checkbox" checked readOnly />예정일 당일</label>
            <label className="notification-day-option notification-day-option--active"><input type="checkbox" checked readOnly />미응답 시 D+7 절약 검토</label>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>배송 수령 확인</h2>
        <p className="settings-section__hint">일반배송과 정기배송의 실제 수령 여부를 확인해요. 수령 확인을 거쳐야 반품 기한·A/S 기준일과 정기배송 다음 회차가 정확히 이어져, 더 안정적으로 주기를 관리할 수 있어요.</p>
        <div className="notification-day-options" aria-label="배송 수령 확인 알림">
          <label className="notification-day-option notification-day-option--active"><input type="checkbox" checked readOnly />예상 도착일 당일 오후 7시</label>
          <label className="notification-day-option notification-day-option--active"><input type="checkbox" checked readOnly />미수령 시 다음 날 재알림</label>
        </div>
      </section>

      <section className="settings-section">
        <h2>알림 테스트</h2>
        <p className="settings-section__hint">현재 로그인한 계정에만 유형별 색 시계 아이콘 테스트 알림을 보냅니다.</p>
        <div className="settings-test-pushes">
          {([
            ['DEADLINE', '기한 예정 알림'],
            ['RENEWAL', '정기배송·구독 유지 확인'],
            ['ARRIVAL', '배송 수령 확인'],
            ...(isPremium ? ([['WEEKLY_SUMMARY', '주간 요약']] as const) : []),
          ] as const).map(([kind, label]) => (
            <button key={kind} className="btn btn-sm" onClick={() => handleSendTestPush(kind)} disabled={sendingTestPush !== null}>
              {sendingTestPush === kind ? '발송 중...' : `${label} 테스트`}
            </button>
          ))}
        </div>
        {testPushMessage && <p className="settings-section__message">{testPushMessage}</p>}
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

            {!sharingLoaded && (
              <div className="skeleton-block">
                <Skeleton width="70%" />
              </div>
            )}

            {sharingLoaded && sentInvites.length > 0 && (
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

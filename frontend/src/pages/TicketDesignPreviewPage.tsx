import StampBadge from '../components/StampBadge';
import BrandAvatar from '../components/dashboard/BrandAvatar';

/* ─── 앱 타입 색상 ─── */
const T = {
  general:      { color: '#6A7BA8', tint: 'rgba(106,123,168,0.12)' },
  recurring:    { color: '#8A9B6A', tint: 'rgba(138,155,106,0.12)' },
  subscription: { color: '#C47B6A', tint: 'rgba(196,123,106,0.12)' },
};

/* ─── 예시 데이터 ─── */
const SAMPLES = [
  {
    typeKey: 'general' as const,
    typeClass: 'GENERAL',
    typeLabel: '일반배송',
    brand: '쿠팡',
    itemName: '로켓배송 주문',
    category: 'SHOPPING' as const,
    categoryEmoji: '🛒',
    categoryLabel: '쇼핑',
    deadline: '2026-08-05',
    scheduleText: '반품기한',
    round: null,
    fixedDayOfMonth: null,
    dDay: 6,
    amount: '34,500원',
    id: 1,
  },
  {
    typeKey: 'recurring' as const,
    typeClass: 'RECURRING_DELIVERY',
    typeLabel: '정기배송',
    brand: '마켓컬리',
    itemName: '마켓컬리 정기배송',
    category: 'FOOD' as const,
    categoryEmoji: '🍽️',
    categoryLabel: '식품',
    deadline: '2026-08-03',
    scheduleText: null,
    round: 5,
    fixedDayOfMonth: null,
    dDay: 4,
    amount: '52,000원',
    id: 2,
  },
  {
    typeKey: 'subscription' as const,
    typeClass: 'SUBSCRIPTION',
    typeLabel: '정기구독',
    brand: 'Patreon',
    itemName: 'Patreon 후원',
    category: 'CREATOR_SUPPORT' as const,
    categoryEmoji: '🎨',
    categoryLabel: '크리에이터 후원',
    deadline: '2026-09-01',
    scheduleText: null,
    round: 3,
    fixedDayOfMonth: 1,
    dDay: 32,
    amount: '$5.00 / 월',
    id: 3,
  },
] as const;

/* ─── A 디자인: 컬러 테두리 + 타입 탭 + 틴트 스텁 (실제 앱 CSS 기반) ─── */
function CardDesignA({ s }: { s: typeof SAMPLES[number] }) {
  const c = T[s.typeKey];
  return (
    <div
      className="ticket-card"
      style={{ border: `2.5px solid ${c.color}` }}
    >
      <div className={`ticket-card__type-tab ticket-card__type-tab--${s.typeClass}`} />
      <div className="ticket-card__body">
        <div className="ticket-card__type-row">
          <span className={`ticket-card__type ticket-card__type--${s.typeClass}`}>
            {s.typeClass === 'GENERAL' ? '📦' : s.typeClass === 'RECURRING_DELIVERY' ? '🔁' : '🔄'} {s.typeLabel}
          </span>
          <span className={`ticket-card__category ticket-card__category--${s.category}`}>
            {s.categoryEmoji} {s.categoryLabel}
          </span>
        </div>
        <div className="ticket-card__heading">
          <BrandAvatar brand={s.brand} />
          <div className="ticket-card__heading-text">
            <span className="brand-kicker">{s.brand}</span>
            <h3 className="ticket-card__title">{s.itemName}</h3>
          </div>
        </div>
        {s.round !== null ? (
          <p className="ticket-card__deadline">
            다음 일정: <span className="mono">{s.round}회차</span>
            {s.fixedDayOfMonth !== null
              ? ` · 매월 ${s.fixedDayOfMonth}일 (${s.deadline})`
              : ` (${s.deadline})`}
          </p>
        ) : (
          <p className="ticket-card__deadline">
            {s.scheduleText} <span className="mono">({s.deadline})</span>
          </p>
        )}
        <p className="ticket-card__amount mono">{s.amount}</p>
        <div className="ticket-card__actions">
          <button className="btn-text">{s.typeClass === 'GENERAL' ? '반품 완료' : '유지하기'}</button>
          <button className="btn-text">수정</button>
          <button className="btn-text">삭제</button>
        </div>
      </div>
      <div className="ticket-card__perforation" />
      <div className="ticket-card__stub" style={{ background: c.tint }}>
        <StampBadge dDay={s.dDay} seed={s.id} />
      </div>
    </div>
  );
}

/* ─── B 디자인: 정보 그리드 내부 (실제 앱 CSS 기반) ─── */
function CardDesignB({ s }: { s: typeof SAMPLES[number] }) {
  const c = T[s.typeKey];
  const scheduleText = s.round !== null
    ? `다음 일정: ${s.round}회차${s.fixedDayOfMonth !== null ? ` · 매월 ${s.fixedDayOfMonth}일` : ''} (${s.deadline})`
    : `${s.scheduleText} (${s.deadline})`;

  return (
    <div className="ticket-card" style={{ border: `2.5px solid ${c.color}` }}>
      <div className={`ticket-card__type-tab ticket-card__type-tab--${s.typeClass}`} />
      <div className="ticket-card__body">
        <div className="ticket-card__heading">
          <BrandAvatar brand={s.brand} />
          <div className="ticket-card__heading-text">
            <span className="brand-kicker">{s.brand}</span>
            <h3 className="ticket-card__title">{s.itemName}</h3>
          </div>
        </div>

        {/* 정보 그리드 — 결제일 / 금액 / 유형 / 카테고리 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px 0',
          background: 'var(--neutral-bg, #f8f8fb)',
          borderRadius: 8,
          padding: '10px 12px',
          margin: '8px 0 10px',
        }}>
          {([
            ['결제일', s.deadline, 'var(--ink)'],
            ['금액',   s.amount,   'var(--ink)'],
            ['유형',   s.typeLabel, c.color],
            ['카테고리', `${s.categoryEmoji} ${s.categoryLabel}`, 'var(--ink-soft)'],
          ] as [string, string, string][]).map(([label, value, color]) => (
            <div key={label}>
              <div style={{ fontSize: '0.56rem', color: 'var(--ink-faint, #bbb)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color }}>{value}</div>
            </div>
          ))}
        </div>

        <p className="ticket-card__deadline">{scheduleText}</p>
        <div className="ticket-card__actions">
          <button className="btn-text">{s.typeClass === 'GENERAL' ? '반품 완료' : '유지하기'}</button>
          <button className="btn-text">수정</button>
          <button className="btn-text">삭제</button>
        </div>
      </div>
      <div className="ticket-card__perforation" />
      <div className="ticket-card__stub">
        <StampBadge dDay={s.dDay} seed={s.id} />
      </div>
    </div>
  );
}

/* ─── C: 현재 실제 앱 카드 (비교 기준) ─── */
function CardCurrent({ s }: { s: typeof SAMPLES[number] }) {
  return (
    <div className="ticket-card">
      <div className={`ticket-card__type-tab ticket-card__type-tab--${s.typeClass}`} />
      <div className="ticket-card__body">
        <div className="ticket-card__type-row">
          <span className={`ticket-card__type ticket-card__type--${s.typeClass}`}>
            {s.typeClass === 'GENERAL' ? '📦' : s.typeClass === 'RECURRING_DELIVERY' ? '🔁' : '🔄'} {s.typeLabel}
          </span>
          <span className={`ticket-card__category ticket-card__category--${s.category}`}>
            {s.categoryEmoji} {s.categoryLabel}
          </span>
        </div>
        <div className="ticket-card__heading">
          <BrandAvatar brand={s.brand} />
          <div className="ticket-card__heading-text">
            <span className="brand-kicker">{s.brand}</span>
            <h3 className="ticket-card__title">{s.itemName}</h3>
          </div>
        </div>
        {s.round !== null ? (
          <p className="ticket-card__deadline">
            다음 일정: <span className="mono">{s.round}회차</span>
            {s.fixedDayOfMonth !== null
              ? ` · 매월 ${s.fixedDayOfMonth}일 (${s.deadline})`
              : ` (${s.deadline})`}
          </p>
        ) : (
          <p className="ticket-card__deadline">
            {s.scheduleText} <span className="mono">({s.deadline})</span>
          </p>
        )}
        <p className="ticket-card__amount mono">{s.amount}</p>
        <div className="ticket-card__actions">
          <button className="btn-text">{s.typeClass === 'GENERAL' ? '반품 완료' : '유지하기'}</button>
          <button className="btn-text">수정</button>
          <button className="btn-text">삭제</button>
        </div>
      </div>
      <div className="ticket-card__perforation" />
      <div className="ticket-card__stub">
        <StampBadge dDay={s.dDay} seed={s.id} />
      </div>
    </div>
  );
}

/* ─── 섹션 구분선 ─── */
function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
      <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#ebebeb' }} />
    </div>
  );
}

/* ─── 카드 세트 (데스크톱 + 모바일) ─── */
function CardSet({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p style={{ fontSize: '0.72rem', color: '#bbb', fontWeight: 600, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        데스크톱
      </p>
      <div className="ticket-list" style={{ marginBottom: 28 }}>
        {children}
      </div>
      <p style={{ fontSize: '0.72rem', color: '#bbb', fontWeight: 600, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        모바일 (390px)
      </p>
      <div style={{
        maxWidth: 390,
        background: 'var(--paper, #f5f5f7)',
        borderRadius: 16,
        padding: '16px 12px',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.08)',
        marginBottom: 48,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '0 4px' }}>
          <div style={{ flex: 1, height: 28, borderRadius: 8, background: 'rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
            <span style={{ fontSize: '0.68rem', color: '#aaa' }}>remindue.kr/dashboard</span>
          </div>
        </div>
        <div className="ticket-list">{children}</div>
      </div>
    </>
  );
}

export default function TicketDesignPreviewPage() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 80px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: 4 }}>티켓 카드 디자인 프리뷰</h1>
      <p style={{ color: '#888', fontSize: '0.88rem', marginBottom: 40 }}>
        실제 앱 CSS 기반으로 렌더링한 디자인 후보 비교
      </p>

      {/* A: 컬러 테두리 + 틴트 스텁 */}
      <Divider label="A. 컬러 테두리 + 탭 + 틴트 스텁" />
      <CardSet>
        {SAMPLES.map((s) => <CardDesignA key={s.typeKey} s={s} />)}
      </CardSet>

      {/* B: 정보 그리드 내부 */}
      <Divider label="B. 정보 그리드 내부" />
      <CardSet>
        {SAMPLES.map((s) => <CardDesignB key={s.typeKey} s={s} />)}
      </CardSet>

      {/* 현재 앱 (비교 기준) */}
      <Divider label="현재 앱 (비교 기준)" />
      <CardSet>
        {SAMPLES.map((s) => <CardCurrent key={s.typeKey} s={s} />)}
      </CardSet>
    </main>
  );
}

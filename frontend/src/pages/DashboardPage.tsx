import { useEffect, useState, type FormEvent } from 'react';
import { fetchPurchases, createPurchase, deletePurchase, markDelivered } from '../api/purchases';
import type { Purchase, PurchaseType } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const TYPE_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '전자제품 (보증기간)',
  ONLINE_ORDER: '온라인 주문 (반품기한)',
  RECURRING_DELIVERY: '정기배송',
};

const DEADLINE_LABEL: Record<PurchaseType, string> = {
  ELECTRONICS: '보증만료일',
  ONLINE_ORDER: '반품기한',
  RECURRING_DELIVERY: '다음 배송일',
};

function dDayColor(dDay: number) {
  if (dDay < 0) return '#999';
  if (dDay <= 3) return '#dc2626';
  if (dDay <= 14) return '#ea580c';
  return '#2563eb';
}

function dDayLabel(dDay: number) {
  if (dDay < 0) return `D+${Math.abs(dDay)} (지남)`;
  if (dDay === 0) return 'D-Day';
  return `D-${dDay}`;
}

export default function DashboardPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [type, setType] = useState<PurchaseType>('ELECTRONICS');
  const [itemName, setItemName] = useState('');
  const [baseDate, setBaseDate] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [returnDeadlineDays, setReturnDeadlineDays] = useState('7');
  const [intervalDays, setIntervalDays] = useState('30');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { nickname, logout } = useAuth();
  const navigate = useNavigate();

  const load = async () => {
    const data = await fetchPurchases();
    setPurchases(data);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await createPurchase({
        type,
        itemName,
        baseDate,
        warrantyMonths: type === 'ELECTRONICS' ? Number(warrantyMonths) : undefined,
        returnDeadlineDays: type === 'ONLINE_ORDER' ? Number(returnDeadlineDays) : undefined,
        intervalDays: type === 'RECURRING_DELIVERY' ? Number(intervalDays) : undefined,
      });
      setItemName('');
      setBaseDate('');
      await load();
    } catch (err) {
      setErrorMessage('등록하지 못했습니다. 입력값을 확인해주세요.');
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    await deletePurchase(id);
    await load();
  };

  const handleMarkDelivered = async (id: number) => {
    await markDelivered(id);
    await load();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const urgent = purchases.filter((p) => p.dDay >= 0 && p.dDay <= 7);

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>{nickname}님의 챙길 목록</h1>
        <button onClick={handleLogout}>로그아웃</button>
      </div>

      {urgent.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, margin: '12px 0' }}>
          <strong style={{ color: '#dc2626' }}>⚠️ 7일 이내 마감 {urgent.length}건</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
            {urgent.map((p) => (
              <li key={p.id} style={{ fontSize: 14 }}>
                {p.itemName} — {DEADLINE_LABEL[p.type]} {p.deadline} ({dDayLabel(p.dDay)})
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '20px 0' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={type} onChange={(e) => setType(e.target.value as PurchaseType)}>
            <option value="ELECTRONICS">전자제품 (보증기간)</option>
            <option value="ONLINE_ORDER">온라인 주문 (반품기한)</option>
            <option value="RECURRING_DELIVERY">정기배송</option>
          </select>
          <input placeholder="항목명 (예: 삼성 냉장고)" value={itemName} onChange={(e) => setItemName(e.target.value)} required />
          <input
            type="date"
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
            required
            title={type === 'RECURRING_DELIVERY' ? '배송 시작일' : type === 'ONLINE_ORDER' ? '수령일' : '구매일'}
          />

          {type === 'ELECTRONICS' && (
            <input
              type="number" style={{ width: 90 }}
              placeholder="보증(개월)"
              value={warrantyMonths}
              onChange={(e) => setWarrantyMonths(e.target.value)}
            />
          )}
          {type === 'ONLINE_ORDER' && (
            <input
              type="number" style={{ width: 90 }}
              placeholder="반품기한(일)"
              value={returnDeadlineDays}
              onChange={(e) => setReturnDeadlineDays(e.target.value)}
            />
          )}
          {type === 'RECURRING_DELIVERY' && (
            <input
              type="number" style={{ width: 90 }}
              placeholder="배송주기(일)"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
            />
          )}
          <button type="submit">추가</button>
        </div>
        {errorMessage && <p style={{ color: 'crimson', fontSize: 13, margin: 0 }}>{errorMessage}</p>}
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th>종류</th>
            <th>항목</th>
            <th>{'기한'}</th>
            <th>D-day</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ fontSize: 13, color: '#666' }}>{TYPE_LABEL[p.type]}</td>
              <td>{p.itemName}</td>
              <td style={{ fontSize: 13 }}>{DEADLINE_LABEL[p.type]}: {p.deadline}</td>
              <td style={{ color: dDayColor(p.dDay), fontWeight: 600 }}>{dDayLabel(p.dDay)}</td>
              <td style={{ display: 'flex', gap: 6 }}>
                {p.type === 'RECURRING_DELIVERY' && (
                  <button onClick={() => handleMarkDelivered(p.id)}>배송 받음</button>
                )}
                <button onClick={() => handleDelete(p.id)}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {purchases.length === 0 && <p style={{ color: '#999' }}>등록된 항목이 없습니다.</p>}
    </div>
  );
}

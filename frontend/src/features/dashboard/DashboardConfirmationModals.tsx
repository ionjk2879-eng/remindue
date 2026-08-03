import type { Dispatch, SetStateAction } from 'react';
import type { Purchase } from '../../types';
interface Props {
  confirmRecurringIds:number[]; recurringSelectionItems:Purchase[]; recurringBatchMaintainedIds:number[];
  setRecurringBatchMaintainedIds:Dispatch<SetStateAction<number[]>>; confirmRecurringBatchToken:string|null;
  confirmArrivalBatchToken:string|null; arrivalConfirmSubmitting:boolean; arrivalConfirmError:string|null;
  arrivalBatchItems:Purchase[]; arrivalBatchReceived:{id:number;daysAgo:number}[];
  setArrivalBatchReceived:Dispatch<SetStateAction<{id:number;daysAgo:number}[]>>;
  confirmArrivalToken:string|null; arrivalConfirmDone:boolean;
  onRecurringBatchConfirm:()=>void; onCloseRecurring:()=>void; onArrivalBatchConfirm:()=>void;
  onCloseArrival:()=>void; onArrivalConfirm:(daysAgo:number)=>void;
}
export default function DashboardConfirmationModals(p:Props) {
  const {confirmRecurringIds,recurringSelectionItems,recurringBatchMaintainedIds,setRecurringBatchMaintainedIds,
    confirmRecurringBatchToken,confirmArrivalBatchToken,arrivalConfirmSubmitting,arrivalConfirmError,
    arrivalBatchItems,arrivalBatchReceived,setArrivalBatchReceived,confirmArrivalToken,arrivalConfirmDone,
    onRecurringBatchConfirm:handleRecurringBatchConfirm,onCloseRecurring:closeRecurringConfirmModal,
    onArrivalBatchConfirm:handleArrivalBatchConfirm,onCloseArrival:closeArrivalConfirmModal,
    onArrivalConfirm:handleArrivalConfirm}=p;
  return (<>
    {confirmRecurringIds.length > 0 && (
      <div className="onboarding-overlay" role="dialog" aria-modal="true">
        <div className="onboarding-modal">
          <p className="onboarding-modal__title">🔔 다음 회차에도 유지할 항목을 선택하세요</p>
          <p className="onboarding-modal__body">다음 배송·결제가 예정된 항목이에요. 유지할 항목만 체크하세요.</p>
          <div className="arrival-modal__choices">
            {recurringSelectionItems.map((p) => (
              <label key={p.id} className="schedule-radio">
                <input type="checkbox" checked={recurringBatchMaintainedIds.includes(p.id)} onChange={(e) =>
                  setRecurringBatchMaintainedIds((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                } />
                {p.itemName}
              </label>
            ))}
            {recurringSelectionItems.length === 0 && <p className="onboarding-modal__body">처리할 항목이 없어요.</p>}
          </div>
          <div className="onboarding-modal__actions">
            {confirmRecurringBatchToken && <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={handleRecurringBatchConfirm}>선택한 {recurringBatchMaintainedIds.length}건 다음 회차 유지 · 나머지 {Math.max(0, recurringSelectionItems.length - recurringBatchMaintainedIds.length)}건 중단</button>}
            <button type="button" className="btn-text" onClick={closeRecurringConfirmModal}>닫기</button>
          </div>
        </div>
      </div>
    )}
    {confirmArrivalBatchToken && (
      <div className="onboarding-overlay" role="dialog" aria-modal="true">
        <div className="onboarding-modal">
          <p className="onboarding-modal__title">📦 받은 배송만 선택하세요</p>
          <p className="onboarding-modal__body">선택하지 않은 배송은 내일 다시 알려드리고, 오늘 대시보드에도 계속 남겨둘게요.</p>
          {arrivalConfirmError && <p className="form-error">{arrivalConfirmError}</p>}
          <div className="arrival-modal__choices">
            {arrivalBatchItems.map((p) => {
              const selected = arrivalBatchReceived.find((item) => item.id === p.id);
              return <div key={p.id} className="arrival-batch-item">
                <label className="schedule-radio"><input type="checkbox" checked={Boolean(selected)} onChange={(e) =>
                  setArrivalBatchReceived((items) => e.target.checked ? [...items, { id: p.id, daysAgo: 0 }] : items.filter((item) => item.id !== p.id))
                } />{p.itemName} · {p.type === 'RECURRING_DELIVERY' ? '정기배송' : '일반배송'}</label>
                {selected && <select value={selected.daysAgo} onChange={(e) => setArrivalBatchReceived((items) => items.map((item) => item.id === p.id ? { ...item, daysAgo: Number(e.target.value) } : item))}>
                  {Array.from({ length: 31 }, (_, daysAgo) => <option key={daysAgo} value={daysAgo}>{daysAgo === 0 ? '오늘 받았어요' : `${daysAgo}일 전 수령`}</option>)}
                </select>}
              </div>;
            })}
          </div>
          <div className="onboarding-modal__actions">
            <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={handleArrivalBatchConfirm}>선택한 {arrivalBatchReceived.length}건 수령 처리 · 나머지 {Math.max(0, arrivalBatchItems.length - arrivalBatchReceived.length)}건 내일 알림</button>
            <button type="button" className="btn-text" onClick={closeArrivalConfirmModal}>나중에</button>
          </div>
        </div>
      </div>
    )}
    {confirmArrivalToken && (
      <div className="onboarding-overlay" role="dialog" aria-modal="true">
        <div className="onboarding-modal">
          {arrivalConfirmDone ? (
            <>
              <p className="onboarding-modal__title">확인했어요!</p>
              <p className="onboarding-modal__body">
                오늘 날짜를 기준으로 정기배송 사이클을 조정했어요.
              </p>
              <div className="onboarding-modal__actions">
                <button type="button" className="btn" onClick={closeArrivalConfirmModal}>
                  닫기
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="onboarding-modal__title">📦 오늘 주문하신 물건이 오셨나요?</p>
              <p className="onboarding-modal__body">
                언제 받으셨는지 알려주시면 이후 배송 주기를 그 날짜 기준으로 다시 계산할게요.
              </p>
              {arrivalConfirmError && <p className="form-error">{arrivalConfirmError}</p>}
              <div className="arrival-modal__choices">
                <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={() => handleArrivalConfirm(0)}>
                  받았어요
                </button>
                <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={() => handleArrivalConfirm(1)}>
                  하루 전에 받았어요
                </button>
                <button type="button" className="btn" disabled={arrivalConfirmSubmitting} onClick={() => handleArrivalConfirm(2)}>
                  이틀 전에 받았어요
                </button>
              </div>
              <div className="onboarding-modal__actions">
                <button type="button" className="btn-text" onClick={closeArrivalConfirmModal}>
                  아직 미도착 / 나중에
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
  </>);
}


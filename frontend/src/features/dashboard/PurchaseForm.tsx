import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PurchaseCategory, PurchaseType } from '../../types';
import { isRecurringType } from '../../types';
import { formatOriginalAmount } from '../../components/dashboard/PurchaseMoney';
import {
  CATEGORY_ICON, CATEGORY_LABEL, FOREIGN_CURRENCIES, PURCHASE_CATEGORIES, formatAmountInput,
} from './dashboardModel';
import {
  estimateArrivalRange, estimatePreviewDeadline, formatKoreanMonthDay,
} from '../../components/dashboard/dashboardUtils';
import type { usePurchaseForm } from './usePurchaseForm';

interface PurchaseFormProps {
  form: ReturnType<typeof usePurchaseForm>;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  errorMessage: string | null;
  showPremiumUpsell: boolean;
}

export default function PurchaseForm({
  form,
  onSubmit: handleSubmit,
  onCancel: handleCancelEdit,
  errorMessage,
  showPremiumUpsell,
}: PurchaseFormProps) {
  const {
    editingId, pendingConfirmId, type, setType, itemName, setItemName, baseDate, setBaseDate,
    expectedDeliveryDate, setExpectedDeliveryDate, amount, setAmount, isElectronics, setIsElectronics,
    warrantyMonths, setWarrantyMonths, returnDeadlineDays, setReturnDeadlineDays,
    intervalDays, setIntervalDays, scheduleType, setScheduleType, fixedDayOfMonth, setFixedDayOfMonth,
    fixedDayIntervalMonths, setFixedDayIntervalMonths, arrivalOffsetDays, setArrivalOffsetDays,
    isOneTime, setIsOneTime, category, setCategory, brand, originalAmount, setOriginalAmount,
    originalCurrency, setOriginalCurrency, setExchangeRate, itemNameInputRef,
  } = form;

  return (
    <form className="register-form" onSubmit={handleSubmit}>
      <p className="register-form__title">
        {editingId !== null ? '항목 수정' : pendingConfirmId !== null ? '확인 대기 항목 등록' : '새 항목 등록'}
      </p>
      {/* 종류 + 항목명 — 이 폼의 "제목"에 해당하는 두 필드라 한 줄에서 항목명이 남는 폭을 다 가져간다. */}
      <div className="register-form__row">
        <div className="field field--narrow">
          <label htmlFor="type">종류</label>
          <div className="type-select-row">
            <span className={`type-dot type-dot--${type}`} aria-hidden="true" />
            <select id="type" value={type} onChange={(e) => {
            const t = e.target.value as PurchaseType;
            setType(t);
            if (t === 'RECURRING_DELIVERY') setScheduleType('FIXED_DAY');
          }}>
              <option value="GENERAL">일반 구매</option>
              <option value="RECURRING_DELIVERY">정기배송</option>
              <option value="SUBSCRIPTION">정기구독</option>
            </select>
          </div>
        </div>

        <div className="field field--wide">
          <label htmlFor="itemName">항목명</label>
          <input
            id="itemName"
            ref={itemNameInputRef}
            placeholder="예: 삼성 냉장고"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
          />
        </div>
      </div>

      {/* 구매일/시작일 + 예상 도착일 — 둘 다 라벨+입력창 하나뿐인 균일한 높이라 나란히 둬도
          어긋나지 않는다. 도착일 안내는 더 이상 문단으로 아래에 펼쳐지지 않고, 라벨 옆 물음표
          아이콘에 마우스를 올리면 뜨는 툴팁(overlay)으로 대체했다 — 문구 길이가 타입마다 달라도
          레이아웃에 전혀 영향을 주지 않는다(field__help/field__tooltip 참고). */}
      <div className="register-form__row">
        <div className="field field--date">
          <label htmlFor="baseDate">
            {type === 'SUBSCRIPTION' ? '시작일' : '구매일'}
          </label>
          <input id="baseDate" type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} required />
        </div>

        {type !== 'SUBSCRIPTION' && (
          <div className="field field--date">
            <label htmlFor="expectedDeliveryDate">
              예상 도착일{type === 'RECURRING_DELIVERY' ? ' (배송 주기 기준일)' : ''}
              <span className="field__help" tabIndex={0}>
                <span className="field__help-icon" aria-hidden="true">?</span>
                <span className="field__tooltip" role="tooltip">
                  {type === 'RECURRING_DELIVERY' &&
                    '비워두면 구매일을 기준으로 계산해요. 스토어가 안내한(또는 원하는) 첫 배송 도착일을 적으면 이후 회차가 그 날짜 기준으로 반복돼요.'}
                  {type === 'GENERAL' &&
                    '비워두면 구매일을 기준으로 계산해요. 적으면 반품기한(7일)·A/S 보증(1년)을 이 날짜부터 계산하고, 오늘부터 7일 안의 도착 예정일은 이번 주 배송 예정에도 표시돼요 — 자세한 환불 가능 날짜와 A/S 보증 만료일은 구매하신 스토어의 상세정보를 꼭 확인해주세요.'}
                </span>
              </span>
            </label>
            <input
              id="expectedDeliveryDate"
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
            {/* 위 "예상 도착일"은 스케줄 계산용 앵커일 뿐이고(자동등록 메일/스토어가 안내한 값을
                그대로 씀, 실제로 그날 온다고 보장 안 됨), 실제 도착은 그 앵커에서 역산한 결제일
                기준 참고용 범위로 따로 보여준다 — 둘을 같은 값으로 오해하지 않도록 라벨과 문구를
                분리했다. 필드 바로 아래 둬서 어느 입력에 대한 안내인지 위치로도 분명하게 한다. */}
            {type === 'RECURRING_DELIVERY' && (expectedDeliveryDate || baseDate) && (() => {
              const anchorDate = expectedDeliveryDate || baseDate;
              const offsetNum = arrivalOffsetDays.trim() !== '' ? Number(arrivalOffsetDays) : null;
              const deadline = estimatePreviewDeadline(anchorDate, offsetNum);
              const range = estimateArrivalRange(deadline);
              return (
                <p className="register-form__hint">
                  📦 실제로는 {formatKoreanMonthDay(range.from)}~{formatKoreanMonthDay(range.to)} 사이에 도착할 가능성이 높아요(참고용)
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {/* 금액 + 카테고리 — 모든 종류에 공통인 일반 필드. */}
      <div className="register-form__row register-form__row--payment">
        <div className="field field--amount">
          <label htmlFor="amount">
            금액(원)
            {originalCurrency && originalAmount !== null && ` (${formatOriginalAmount(originalAmount, originalCurrency)} 결제)`}
          </label>
          <input
            id="amount"
            type="text"
            inputMode="numeric"
            placeholder={originalCurrency ? '저장 시 자동 계산' : '선택 입력'}
            value={amount}
            disabled={originalCurrency !== null}
            onChange={(e) => setAmount(formatAmountInput(e.target.value))}
          />
        </div>

        <div className="field field--narrow">
          <label htmlFor="category">카테고리</label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value as PurchaseCategory)}>
            {PURCHASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="register-form__row register-form__row--payment">
        <div className="field field--narrow">
          <label htmlFor="paymentCurrency">결제 통화</label>
          <select
            id="paymentCurrency"
            value={originalCurrency ?? 'KRW'}
            onChange={(e) => {
              const currency = e.target.value === 'KRW' ? null : e.target.value;
              setOriginalCurrency(currency);
              setOriginalAmount(null);
              setExchangeRate(null);
              if (currency) setAmount('');
            }}
          >
            <option value="KRW">KRW (원화)</option>
            {FOREIGN_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>

        {originalCurrency && (
          <div className="field field--amount">
            <label htmlFor="originalAmount">외화 결제 금액</label>
            <input
              id="originalAmount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              required
              placeholder={`예: ${originalCurrency === 'JPY' ? '1200' : '9.99'}`}
              value={originalAmount ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setOriginalAmount(value === '' ? null : Number(value));
                setExchangeRate(null);
                setAmount('');
              }}
            />
            <p className="register-form__hint">결제일 기준 환율과 설정한 카드 수수료로 원화 금액을 계산해요.</p>
          </div>
        )}
      </div>

      {/* 종류별 전용 필드 — GENERAL은 반품기한·A/S, 정기배송/구독은 스케줄 방식·주기. 둘 다
          체크박스/라디오 그룹에 field와 같은 캡션을 얹어서(field__static-label) 옆의 입력창과
          라벨 높이·베이스라인이 어긋나지 않게 맞춘다. */}
      {type === 'GENERAL' && (
        <div className="register-form__row">
          <div className="field field--narrow">
            <label htmlFor="returnDeadlineDays">반품기한(일)</label>
            <input
              id="returnDeadlineDays"
              type="number"
              value={returnDeadlineDays}
              onChange={(e) => setReturnDeadlineDays(e.target.value)}
            />
          </div>
          <div className="field field--narrow">
            <span className="field__static-label">전자제품</span>
            <label className="schedule-radio schedule-radio--field">
              <input
                type="checkbox"
                checked={isElectronics}
                onChange={(e) => setIsElectronics(e.target.checked)}
              />
              A/S 보증도 추적
            </label>
          </div>
          {isElectronics && (
            <div className="field field--narrow">
              <label htmlFor="warrantyMonths">보증(개월)</label>
              <input
                id="warrantyMonths"
                type="number"
                value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(e.target.value)}
              />
            </div>
          )}
        </div>
      )}
      {isRecurringType(type) && (
        <div className="register-form__row register-form__row--recurring">
          {scheduleType === 'INTERVAL' && (
            <div className="field field--narrow">
              <label htmlFor="intervalDays">주기(일)</label>
              <input
                id="intervalDays"
                type="number"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
          )}
          {scheduleType === 'FIXED_DAY' && (
            <>
              <div className="field field--narrow">
                <label htmlFor="fixedDayIntervalMonths">{type === 'RECURRING_DELIVERY' ? 'N개월마다' : '몇 달마다'}</label>
                <input
                  id="fixedDayIntervalMonths"
                  type="number"
                  min={1}
                  max={type === 'RECURRING_DELIVERY' ? 12 : 6}
                  value={fixedDayIntervalMonths}
                  onChange={(e) => setFixedDayIntervalMonths(e.target.value)}
                />
              </div>
              <div className="field field--narrow">
                <label htmlFor="fixedDayOfMonth">{type === 'RECURRING_DELIVERY' ? '도착 기준일' : '며칠'}</label>
                <input
                  id="fixedDayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  value={fixedDayOfMonth}
                  onChange={(e) => setFixedDayOfMonth(e.target.value)}
                />
              </div>
            </>
          )}
          {type === 'RECURRING_DELIVERY' && (
            <div className="field field--narrow">
              <label htmlFor="arrivalOffsetDays">도착까지 영업일</label>
              <input
                id="arrivalOffsetDays"
                type="number"
                min={0}
                placeholder="예: 2"
                value={arrivalOffsetDays}
                onChange={(e) => setArrivalOffsetDays(e.target.value)}
              />
            </div>
          )}
          <div className="schedule-type-toggle" role="radiogroup" aria-label="스케줄 방식">
            <label className={`schedule-type-toggle__option${scheduleType === 'INTERVAL' ? ' schedule-type-toggle__option--active' : ''}`}>
              <input
                type="radio"
                name="scheduleType"
                value="INTERVAL"
                checked={scheduleType === 'INTERVAL'}
                onChange={() => setScheduleType('INTERVAL')}
              />
              {type === 'RECURRING_DELIVERY' ? '주·일 단위' : 'N일마다'}
            </label>
            <label className={`schedule-type-toggle__option${scheduleType === 'FIXED_DAY' ? ' schedule-type-toggle__option--active' : ''}`}>
              <input
                type="radio"
                name="scheduleType"
                value="FIXED_DAY"
                checked={scheduleType === 'FIXED_DAY'}
                onChange={() => setScheduleType('FIXED_DAY')}
              />
              {type === 'RECURRING_DELIVERY' ? '달 단위' : '매월 N일 고정'}
            </label>
          </div>
          <label className="one-time-toggle">
            <input type="checkbox" checked={isOneTime} onChange={(e) => setIsOneTime(e.target.checked)} />
            <span>
              <strong>한 번만 사용</strong>
              <small>항목은 목록에 남기고, 다음 회차의 유지 확인과 예상 지출은 만들지 않아요.</small>
            </span>
          </label>
        </div>
      )}

      {type === 'GENERAL' && editingId === null && (
        <p className="register-form__hint">
          온라인 쇼핑·택배처럼 한 번 구매하고 배송받는 항목이에요. 도착 예정일을 입력하면 이번 주 배송 예정과 반품기한을 함께 챙겨드려요.
        </p>
      )}
      {type === 'RECURRING_DELIVERY' && editingId === null && (
        <p className="register-form__hint">
          생필품 정기배송처럼 일정한 주기로 실물 상품을 받아보는 항목이에요. 첫 배송 예정일과 주기를 입력하면 다음 배송일을 챙겨드려요.
        </p>
      )}
      {type === 'SUBSCRIPTION' && editingId === null && (
        <p className="register-form__hint">
          넷플릭스·도메인/호스팅 갱신·멤버십처럼 실물 배송 없이 정기결제되는 항목이에요.
        </p>
      )}

      <div className="register-form__actions">
        <button type="submit" className="btn">
          {editingId !== null ? '수정 완료' : '등록'}
        </button>
        <button type="button" className="btn-text" onClick={handleCancelEdit}>
          {editingId !== null || pendingConfirmId !== null ? '취소' : '접기'}
        </button>
      </div>
      {errorMessage && <p className="form-error" style={{ marginTop: 12 }}>{errorMessage}</p>}
      {showPremiumUpsell && (
        <p className="premium-upsell" style={{ marginTop: 6 }}>
          ✨ 프리미엄으로 업그레이드하면 등록 개수 제한 없이 이용할 수 있어요.{' '}
          <Link to="/pricing">업그레이드하기 →</Link>
        </p>
      )}
    </form>
  );
}


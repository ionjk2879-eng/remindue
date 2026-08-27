import { useRef, useState } from 'react';
import type { PendingPurchase, Purchase, PurchaseCategory, PurchaseType, ScheduleType } from '../../types';
import { isRecurringType } from '../../types';
import { formatAmountInput } from './dashboardModel';

export function usePurchaseForm() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingConfirmId, setPendingConfirmId] = useState<number | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [type, setType] = useState<PurchaseType>('GENERAL');
  const [itemName, setItemName] = useState('');
  const [baseDate, setBaseDate] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [amount, setAmount] = useState('');
  const [isElectronics, setIsElectronics] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState('12');
  const [returnDeadlineDays, setReturnDeadlineDays] = useState('7');
  const [intervalDays, setIntervalDays] = useState('30');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('INTERVAL');
  const [fixedDayOfMonth, setFixedDayOfMonth] = useState('1');
  const [fixedDayIntervalMonths, setFixedDayIntervalMonths] = useState('1');
  const [arrivalOffsetDays, setArrivalOffsetDays] = useState('');
  const [isOneTime, setIsOneTime] = useState(false);
  const [category, setCategory] = useState<PurchaseCategory>('OTHER');
  const [categoryTags, setCategoryTags] = useState<PurchaseCategory[]>(['OTHER']);
  const [brand, setBrand] = useState('');
  const [brandDomain, setBrandDomain] = useState<string | null>(null);
  const [originalAmount, setOriginalAmount] = useState<number | null>(null);
  const [originalCurrency, setOriginalCurrency] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  // 재구독 연결 — suggestedPastPurchaseId는 확인 대기 항목이 알려준 "지난 항목" 힌트(불변),
  // linkPastPurchase는 사용자가 실제로 이어붙이길 원하는지 고르는 체크박스. 제출 시
  // linkPastPurchase가 true일 때만 suggestedPastPurchaseId를 서버로 보낸다.
  const [suggestedPastPurchaseId, setSuggestedPastPurchaseId] = useState<number | null>(null);
  const [linkPastPurchase, setLinkPastPurchase] = useState(false);
  const itemNameInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditingId(null);
    setPendingConfirmId(null);
    setType('GENERAL');
    setItemName('');
    setBaseDate('');
    setExpectedDeliveryDate('');
    setAmount('');
    setIsElectronics(false);
    setWarrantyMonths('12');
    setReturnDeadlineDays('7');
    setIntervalDays('30');
    setScheduleType('INTERVAL');
    setFixedDayOfMonth('1');
    setFixedDayIntervalMonths('1');
    setArrivalOffsetDays('');
    setIsOneTime(false);
    setCategory('OTHER');
    setCategoryTags(['OTHER']);
    setBrand('');
    setBrandDomain(null);
    setOriginalAmount(null);
    setOriginalCurrency(null);
    setExchangeRate(null);
    setSuggestedPastPurchaseId(null);
    setLinkPastPurchase(false);
    setShowRegisterForm(false);
  };

  const beginEdit = (purchase: Purchase) => {
    setShowRegisterForm(true);
    setEditingId(purchase.id);
    setType(purchase.type);
    setItemName(purchase.itemName);
    setBaseDate(purchase.baseDate);
    setExpectedDeliveryDate(purchase.expectedDeliveryDate ?? '');
    setAmount(purchase.amount !== null ? formatAmountInput(String(purchase.amount)) : '');
    setIsElectronics(purchase.warrantyMonths !== null);
    setWarrantyMonths(String(purchase.warrantyMonths ?? 12));
    setReturnDeadlineDays(String(purchase.returnDeadlineDays ?? 7));
    setIntervalDays(String(purchase.intervalDays ?? 30));
    setScheduleType(purchase.scheduleType ?? 'INTERVAL');
    setFixedDayOfMonth(String(purchase.fixedDayOfMonth ?? 1));
    setFixedDayIntervalMonths(String(purchase.fixedDayIntervalMonths ?? 1));
    setArrivalOffsetDays(purchase.arrivalOffsetDays !== null ? String(purchase.arrivalOffsetDays) : '');
    setIsOneTime(purchase.isOneTime);
    setCategory(purchase.category ?? 'OTHER');
    setCategoryTags(purchase.categoryTags.length > 0 ? purchase.categoryTags : [purchase.category ?? 'OTHER']);
    setBrand(purchase.brand ?? '');
    setBrandDomain(purchase.brandDomain ?? null);
    setOriginalAmount(purchase.originalAmount ?? null);
    setOriginalCurrency(purchase.originalCurrency ?? null);
    setExchangeRate(purchase.exchangeRate ?? null);
    setTimeout(() => {
      itemNameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      itemNameInputRef.current?.focus();
    }, 0);
  };

  const beginPendingRegistration = (item: PendingPurchase) => {
    resetForm();
    setShowRegisterForm(true);
    setType(item.type);
    setItemName(item.itemName ?? '');
    setAmount(item.amount !== null ? formatAmountInput(String(item.amount)) : '');
    setBaseDate(item.orderDate ?? item.expectedDeliveryDate ?? '');
    setExpectedDeliveryDate(item.type !== 'SUBSCRIPTION' ? item.expectedDeliveryDate ?? '' : '');

    if (isRecurringType(item.type)) {
      if (item.type === 'RECURRING_DELIVERY') {
        if (item.arrivalOffsetDays !== null) setArrivalOffsetDays(String(item.arrivalOffsetDays));
        setScheduleType('FIXED_DAY');
        const deliveryDay = item.expectedDeliveryDate
          ? Number.parseInt(item.expectedDeliveryDate.split('-')[2], 10)
          : (item.fixedDayOfMonth ?? 1);
        setFixedDayOfMonth(String(deliveryDay));
        const months = item.scheduleType === 'FIXED_DAY'
          ? item.fixedDayIntervalMonths
          : (item.intervalDays ? Math.max(1, Math.round(item.intervalDays / 30)) : 1);
        setFixedDayIntervalMonths(String(months));
      } else {
        const nextScheduleType = item.scheduleType ?? 'INTERVAL';
        setScheduleType(nextScheduleType);
        if (nextScheduleType === 'FIXED_DAY' && item.fixedDayOfMonth !== null) {
          setFixedDayOfMonth(String(item.fixedDayOfMonth));
          setFixedDayIntervalMonths(String(item.fixedDayIntervalMonths ?? 1));
        } else if (item.intervalDays !== null) {
          setIntervalDays(String(item.intervalDays));
        }
      }
    } else {
      if (item.returnDeadlineDays !== null) setReturnDeadlineDays(String(item.returnDeadlineDays));
      if (item.warrantyMonths !== null) {
        setIsElectronics(true);
        setWarrantyMonths(String(item.warrantyMonths));
      }
    }

    setCategory(item.category ?? 'OTHER');
    setCategoryTags(item.categoryTags.length > 0 ? item.categoryTags : [item.category ?? 'OTHER']);
    setBrand(item.brand ?? '');
    setBrandDomain(item.brandDomain ?? null);
    setOriginalAmount(item.originalAmount ?? null);
    setOriginalCurrency(item.originalCurrency ?? null);
    setExchangeRate(item.exchangeRate ?? null);
    setPendingConfirmId(item.id);
  };

  return {
    editingId, pendingConfirmId, setPendingConfirmId, showRegisterForm, setShowRegisterForm,
    type, setType, itemName, setItemName, baseDate, setBaseDate,
    expectedDeliveryDate, setExpectedDeliveryDate, amount, setAmount,
    isElectronics, setIsElectronics, warrantyMonths, setWarrantyMonths,
    returnDeadlineDays, setReturnDeadlineDays, intervalDays, setIntervalDays,
    scheduleType, setScheduleType, fixedDayOfMonth, setFixedDayOfMonth,
    fixedDayIntervalMonths, setFixedDayIntervalMonths, arrivalOffsetDays, setArrivalOffsetDays,
    isOneTime, setIsOneTime, category, setCategory, categoryTags, setCategoryTags,
    brand, setBrand, brandDomain, setBrandDomain, originalAmount, setOriginalAmount,
    originalCurrency, setOriginalCurrency, exchangeRate, setExchangeRate,
    suggestedPastPurchaseId, setSuggestedPastPurchaseId, linkPastPurchase, setLinkPastPurchase,
    itemNameInputRef, resetForm, beginEdit, beginPendingRegistration,
  };
}

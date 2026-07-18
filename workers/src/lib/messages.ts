// D-day 다이제스트(이메일+푸시)에 실제로 노출되는 한국어 문구 규칙.
// D-7/D-3은 일반 안내 톤, D-1/D-0은 시점이 명확히 드러나도록 타입별로 다르게 쓴다.
// computeDeadline/computeDDay(purchase-logic.ts)은 건드리지 않고 문구 조립만 이 파일이 맡는다.

import type { PurchaseType } from '../types';

export interface DigestItem {
  itemName: string;
  type: PurchaseType;
  dDay: number;
  deadline: string;
}

export function formatDDay(dDay: number): string {
  return dDay === 0 ? 'D-DAY' : `D-${dDay}`;
}

const DEADLINE_NOUN: Record<PurchaseType, string> = {
  ONLINE_ORDER: '반품기한',
  ELECTRONICS: '보증만료',
  RECURRING_DELIVERY: '다음배송',
};

/** 항목명을 뺀 나머지 절 — 이메일 표에서 굵은 항목명 아래에 붙일 때 쓴다(이름 중복 방지). */
export function buildItemClause(item: DigestItem): string {
  const { type, dDay } = item;

  if (dDay === 7 || dDay === 3) {
    return `${dDay}일 후 ${DEADLINE_NOUN[type]}입니다`;
  }

  if (dDay === 1) {
    switch (type) {
      case 'ONLINE_ORDER':
        return '반품기한이 내일까지예요';
      case 'ELECTRONICS':
        return '보증기간이 내일 만료돼요';
      case 'RECURRING_DELIVERY':
        return '다음 배송이 내일이에요';
    }
  }

  // dDay === 0
  switch (type) {
    case 'ONLINE_ORDER':
      return '반품기한이 오늘까지예요 — 오늘 안에 발송하면 인정돼요';
    case 'ELECTRONICS':
      return '보증기간이 오늘 만료돼요';
    case 'RECURRING_DELIVERY':
      return '오늘 배송 예정이에요';
  }
}

/** 항목명까지 포함한 완전한 한 문장 — 푸시 본문처럼 이름이 별도로 안 보이는 곳에서 쓴다. */
export function buildItemMessage(item: DigestItem): string {
  const clause = buildItemClause(item);

  if (item.dDay === 7 || item.dDay === 3) {
    return `${item.itemName}, ${clause}`;
  }
  return `${item.itemName} ${clause}`;
}

/**
 * 이메일 제목/본문 헤딩, 푸시 제목에 공통으로 쓰는 다이제스트 타이틀.
 * items는 호출부에서 이미 dDay 오름차순(0→1→3→7)으로 정렬돼 있다고 가정한다.
 * D-0/D-1이 하나라도 있으면 그 시점 기준으로 다급한 톤, 아니면 기존 일반 톤을 쓴다.
 */
export function buildDigestTitle(items: DigestItem[]): string {
  if (items.length === 0) return '챙길 게 있어요';

  const mostUrgent = items[0];
  const restCount = items.length - 1;
  const suffix = restCount > 0 ? ` 외 ${restCount}건` : '';

  if (mostUrgent.dDay === 0) return `오늘 마감! ${mostUrgent.itemName}${suffix}`;
  if (mostUrgent.dDay === 1) return `내일 마감! ${mostUrgent.itemName}${suffix}`;
  return `챙길 게 ${items.length}건 있어요`;
}

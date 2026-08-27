// 커스텀 알림 시점 — "D-day가 며칠일 때 알릴지"를 사용자가 고를 수 있게 한다. 모든 계정이
// 자유롭게 설정할 수 있고, 저장된 값이 없거나 손상됐으면 DEFAULT_NOTIFICATION_DAYS로 대체한다.

import {
  DEFAULT_NOTIFICATION_DAYS as SHARED_DEFAULT_NOTIFICATION_DAYS,
  NOTIFICATION_DAY_OPTIONS as SHARED_NOTIFICATION_DAY_OPTIONS,
} from '../../../shared/domain-policy';

export const DEFAULT_NOTIFICATION_DAYS: readonly number[] = SHARED_DEFAULT_NOTIFICATION_DAYS;
export const MIN_NOTIFICATION_DAY = 0;
export const MAX_NOTIFICATION_DAY = 60;
/** 사용자가 선택할 수 있는 알림 시점 후보 — 프론트 설정 화면의 체크박스 목록과 동일하다. */
export const NOTIFICATION_DAY_OPTIONS: readonly number[] = SHARED_NOTIFICATION_DAY_OPTIONS;

export function serializeNotificationDays(days: number[]): string {
  return days.length === 0 ? 'none' : days.join(',');
}

/** 잘못 저장된 값(빈 문자열, 손상된 데이터 등)은 조용히 기본값으로 대체한다 — 다이제스트가 죽는 것보다는 낫다. */
export function parseNotificationDays(raw: string): number[] {
  if (raw.trim().toLowerCase() === 'none') return [];
  const parsed = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= MIN_NOTIFICATION_DAY && n <= MAX_NOTIFICATION_DAY);
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [...DEFAULT_NOTIFICATION_DAYS];
}

/** 알림 발송/조회 로직은 반드시 이 함수를 통해서만 알림 시점을 얻어야 한다. */
export function effectiveNotificationDays(rawNotificationDays: string): number[] {
  return parseNotificationDays(rawNotificationDays);
}

export class InvalidNotificationDaysError extends Error {}

/** PUT 요청 바디 검증 — 정수 배열이고, 범위 안이고, 0~10개 사이여야 한다(빈 배열은 알림 끄기). */
export function validateNotificationDaysInput(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 10) {
    throw new InvalidNotificationDaysError('notificationDays는 0~10개의 정수 배열이어야 합니다');
  }
  const days = value.map((v) => Number(v));
  if (days.some((d) => !Number.isInteger(d) || d < MIN_NOTIFICATION_DAY || d > MAX_NOTIFICATION_DAY)) {
    throw new InvalidNotificationDaysError(`notificationDays는 ${MIN_NOTIFICATION_DAY}~${MAX_NOTIFICATION_DAY} 사이의 정수여야 합니다`);
  }
  return Array.from(new Set(days));
}

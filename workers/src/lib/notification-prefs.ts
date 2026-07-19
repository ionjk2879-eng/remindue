// 커스텀 알림 시점(프리미엄) — "D-day가 며칠일 때 알릴지"를 사용자가 고를 수 있게 한다.
// 무료 플랜은 이 값을 저장은 해도(나중에 다시 프리미엄이 되면 되살아나게) 실제 알림
// 발송/조회 시점에는 항상 DEFAULT_NOTIFICATION_DAYS로 강제한다 — effectiveNotificationDays가
// 그 강제를 담당하는 유일한 통로다.

export const DEFAULT_NOTIFICATION_DAYS: readonly number[] = [7, 3, 1, 0];
export const MIN_NOTIFICATION_DAY = 0;
export const MAX_NOTIFICATION_DAY = 60;
/** 사용자가 선택할 수 있는 알림 시점 후보 — 프론트 설정 화면의 체크박스 목록과 동일하다. */
export const NOTIFICATION_DAY_OPTIONS: readonly number[] = [10, 7, 5, 3, 2, 1, 0];

export function serializeNotificationDays(days: number[]): string {
  return days.join(',');
}

/** 잘못 저장된 값(빈 문자열, 손상된 데이터 등)은 조용히 기본값으로 대체한다 — 다이제스트가 죽는 것보다는 낫다. */
export function parseNotificationDays(raw: string): number[] {
  const parsed = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= MIN_NOTIFICATION_DAY && n <= MAX_NOTIFICATION_DAY);
  const unique = Array.from(new Set(parsed));
  return unique.length > 0 ? unique : [...DEFAULT_NOTIFICATION_DAYS];
}

/** 무료 플랜은 저장된 값과 무관하게 항상 고정값을 쓴다 — 알림 발송/조회 로직은 반드시 이 함수를 통해서만 알림 시점을 얻어야 한다. */
export function effectiveNotificationDays(isPremium: boolean, rawNotificationDays: string): number[] {
  if (!isPremium) return [...DEFAULT_NOTIFICATION_DAYS];
  return parseNotificationDays(rawNotificationDays);
}

export class InvalidNotificationDaysError extends Error {}

/** PUT 요청 바디 검증 — 정수 배열이고, 범위 안이고, 1~10개 사이여야 한다(0개는 "알림 끄기"가 아니라 실수로 취급). */
export function validateNotificationDaysInput(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new InvalidNotificationDaysError('notificationDays는 1~10개의 정수 배열이어야 합니다');
  }
  const days = value.map((v) => Number(v));
  if (days.some((d) => !Number.isInteger(d) || d < MIN_NOTIFICATION_DAY || d > MAX_NOTIFICATION_DAY)) {
    throw new InvalidNotificationDaysError(`notificationDays는 ${MIN_NOTIFICATION_DAY}~${MAX_NOTIFICATION_DAY} 사이의 정수여야 합니다`);
  }
  return Array.from(new Set(days));
}

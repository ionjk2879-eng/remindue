import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_DAYS,
  InvalidNotificationDaysError,
  effectiveNotificationDays,
  parseNotificationDays,
  serializeNotificationDays,
  validateNotificationDaysInput,
} from './notification-prefs';

describe('notification preferences', () => {
  it('normalizes valid stored values and falls back for damaged data', () => {
    expect(parseNotificationDays('10, 3,3,0')).toEqual([10, 3, 0]);
    expect(parseNotificationDays('broken, -1, 61')).toEqual(DEFAULT_NOTIFICATION_DAYS);
    expect(serializeNotificationDays([10, 3, 0])).toBe('10,3,0');
    expect(parseNotificationDays('none')).toEqual([]);
    expect(serializeNotificationDays([])).toBe('none');
  });

  it('returns the parsed stored value for anyone', () => {
    expect(effectiveNotificationDays('10,5')).toEqual([10, 5]);
    expect(effectiveNotificationDays('broken')).toEqual(DEFAULT_NOTIFICATION_DAYS);
  });

  it('validates API input and removes duplicates', () => {
    expect(validateNotificationDaysInput([7, 3, 3, 0])).toEqual([7, 3, 0]);
    expect(validateNotificationDaysInput([])).toEqual([]);
    expect(() => validateNotificationDaysInput([61])).toThrow(InvalidNotificationDaysError);
    expect(() => validateNotificationDaysInput(['tomorrow'])).toThrow(InvalidNotificationDaysError);
  });
});

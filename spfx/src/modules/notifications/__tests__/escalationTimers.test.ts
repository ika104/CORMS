import {
  computeDeadlineIso,
  DEFAULT_SLA_CONFIG,
  effectiveReminderCadenceDays,
  escalationState,
  parseDays,
  resolveSlaConfig,
  SLA_CONFIG_KEYS,
} from '../escalationTimers';

describe('CMS-016 escalationTimers', () => {
  describe('parseDays', () => {
    it('parses a valid day count and rounds', () => {
      expect(parseDays('5', 2)).toBe(5);
      expect(parseDays('2.6', 2)).toBe(3);
    });
    it('falls back for blank/non-numeric/negative', () => {
      expect(parseDays(undefined, 2)).toBe(2);
      expect(parseDays('', 2)).toBe(2);
      expect(parseDays('abc', 2)).toBe(2);
      expect(parseDays('-1', 2)).toBe(2);
    });
  });

  describe('resolveSlaConfig', () => {
    it('reads the four keys, applying defaults for the missing ones', () => {
      const cfg = resolveSlaConfig({
        [SLA_CONFIG_KEYS.responseDeadlineDays]: '7',
        [SLA_CONFIG_KEYS.expeditedDays]: '1',
        [SLA_CONFIG_KEYS.routingEmailEnabled]: 'false',
      });
      expect(cfg.responseDeadlineDays).toBe(7);
      expect(cfg.reminderCadenceDays).toBe(DEFAULT_SLA_CONFIG.reminderCadenceDays);
      expect(cfg.expeditedDays).toBe(1);
      expect(cfg.routingEmailEnabled).toBe(false);
    });
    it('defaults routingEmailEnabled to true when unset', () => {
      expect(resolveSlaConfig({}).routingEmailEnabled).toBe(true);
    });
  });

  describe('computeDeadlineIso — AC5 (current date + configured days)', () => {
    it('adds calendar days and returns a YYYY-MM-DD date', () => {
      expect(computeDeadlineIso('2026-01-10T09:30:00Z', 5)).toBe('2026-01-15');
    });
    it('crosses month boundaries', () => {
      expect(computeDeadlineIso('2026-01-30', 3)).toBe('2026-02-02');
    });
    it('treats a bad base date as its own date part', () => {
      expect(computeDeadlineIso('not-a-date', 5)).toBe('not-a-date');
    });
  });

  describe('effectiveReminderCadenceDays — CMS-015 AC4', () => {
    const cfg = { ...DEFAULT_SLA_CONFIG, reminderCadenceDays: 2, expeditedDays: 1 };
    it('uses the normal cadence for a non-expedited item', () => {
      expect(effectiveReminderCadenceDays(cfg, false)).toBe(2);
    });
    it('shortens to the expedited window for an expedited item', () => {
      expect(effectiveReminderCadenceDays(cfg, true)).toBe(1);
    });
    it('never lengthens for an expedited item if expeditedDays is larger', () => {
      expect(effectiveReminderCadenceDays({ ...cfg, expeditedDays: 5 }, true)).toBe(2);
    });
  });

  describe('escalationState — AC2/AC4', () => {
    it('returns none when there is no deadline', () => {
      expect(escalationState(undefined, 2, '2026-01-10')).toBe('none');
    });
    it('is overdue once the deadline has passed', () => {
      expect(escalationState('2026-01-10', 2, '2026-01-11')).toBe('overdue');
    });
    it('is approaching within the cadence window, inclusive of the deadline day', () => {
      expect(escalationState('2026-01-10', 2, '2026-01-08')).toBe('approaching');
      expect(escalationState('2026-01-10', 2, '2026-01-10')).toBe('approaching');
    });
    it('is none before the cadence window opens', () => {
      expect(escalationState('2026-01-10', 2, '2026-01-07')).toBe('none');
    });
  });
});

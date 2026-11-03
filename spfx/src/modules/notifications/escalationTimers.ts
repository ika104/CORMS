/**
 * CMS-016 (+ CMS-015 AC4) — pure notification/escalation timing logic. Kept free of React/DOM/network
 * so it is unit-testable on its own; the useSlaConfig hook feeds it the admin-config values and the
 * views/badges consume the resolved state. RecordsHub/Power Automate performs the actual email send
 * (AC1/AC2) — this module is only the CORMS-side derivation of deadlines and escalation state from
 * config that is never hardcoded (AC3) and is read via REST (adminConfigService), so cadences change
 * without a redeploy.
 */

export const SLA_CONFIG_KEYS = {
  responseDeadlineDays: 'sla.responseDeadlineDays',
  reminderCadenceDays: 'escalation.reminderCadenceDays',
  expeditedDays: 'escalation.expeditedDays',
  routingEmailEnabled: 'notification.routingEmailEnabled',
} as const;

export const DEFAULT_RESPONSE_DEADLINE_DAYS = 5;
export const DEFAULT_REMINDER_CADENCE_DAYS = 2;
export const DEFAULT_EXPEDITED_DAYS = 1;

export interface ISlaConfig {
  /** Days added at classification to derive a response deadline when none is set (AC4/AC5). */
  responseDeadlineDays: number;
  /** Days before the deadline at which a normal item is "approaching" (escalation due) (AC2). */
  reminderCadenceDays: number;
  /** Shortened "approaching" window for expedited items — CMS-015 AC4. */
  expeditedDays: number;
  /** Tenant-wide default for the routing email notification (AC1). */
  routingEmailEnabled: boolean;
}

export const DEFAULT_SLA_CONFIG: ISlaConfig = {
  responseDeadlineDays: DEFAULT_RESPONSE_DEADLINE_DAYS,
  reminderCadenceDays: DEFAULT_REMINDER_CADENCE_DAYS,
  expeditedDays: DEFAULT_EXPEDITED_DAYS,
  routingEmailEnabled: true,
};

/** Parses a non-negative integer day count, falling back to `fallback` for blank/non-numeric/negative
 * input so a typo never disables a timer or produces a nonsensical deadline. */
export function parseDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

/** Resolves the SLA/escalation config from a raw key→value map (CORMS_AdminConfig via REST). */
export function resolveSlaConfig(values: Record<string, string | undefined>): ISlaConfig {
  return {
    responseDeadlineDays: parseDays(values[SLA_CONFIG_KEYS.responseDeadlineDays], DEFAULT_RESPONSE_DEADLINE_DAYS),
    reminderCadenceDays: parseDays(values[SLA_CONFIG_KEYS.reminderCadenceDays], DEFAULT_REMINDER_CADENCE_DAYS),
    expeditedDays: parseDays(values[SLA_CONFIG_KEYS.expeditedDays], DEFAULT_EXPEDITED_DAYS),
    routingEmailEnabled: parseBool(values[SLA_CONFIG_KEYS.routingEmailEnabled], true),
  };
}

/** The date portion (YYYY-MM-DD) of an ISO date or datetime string. */
function toDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * CMS-016 AC5 — task/deadline end dates are calculated dynamically as (base date + configured days).
 * `fromIso` is any ISO date/datetime (e.g. the current date, or the classification date); returns a
 * YYYY-MM-DD date string `days` calendar days later. UTC math keeps it timezone-stable.
 */
export function computeDeadlineIso(fromIso: string, days: number): string {
  const base = new Date(`${toDatePart(fromIso)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return toDatePart(fromIso);
  base.setUTCDate(base.getUTCDate() + Math.max(0, Math.round(days)));
  return base.toISOString().slice(0, 10);
}

/**
 * CMS-015 AC4 — the effective "approaching" window for an item: the shortened expedited window when
 * the item is expedited (so it escalates sooner), otherwise the normal cadence. Never longer than the
 * normal cadence for an expedited item.
 */
export function effectiveReminderCadenceDays(config: ISlaConfig, expedited: boolean): number {
  if (!expedited) return config.reminderCadenceDays;
  return Math.min(config.reminderCadenceDays, config.expeditedDays);
}

export type EscalationState = 'none' | 'approaching' | 'overdue';

/**
 * CMS-016 AC2/AC4 — the escalation state of an item against its response deadline (from CMS-010's
 * captured expiry or a CMS-042 follow-up date). `overdue` once the deadline has passed; `approaching`
 * once within `cadenceDays` of it; `none` otherwise. Compared on the date part so a same-day deadline
 * reads as approaching, not overdue. Returns `none` when there is no deadline to measure against.
 */
export function escalationState(
  deadlineIso: string | undefined,
  cadenceDays: number,
  nowIso: string
): EscalationState {
  if (!deadlineIso) return 'none';
  const deadline = toDatePart(deadlineIso);
  const today = toDatePart(nowIso);
  if (today > deadline) return 'overdue';
  const warnFrom = shiftDate(deadline, -Math.max(0, Math.round(cadenceDays)));
  return today >= warnFrom ? 'approaching' : 'none';
}

/** Shifts a YYYY-MM-DD date by a (possibly negative) number of days, UTC-stable. */
function shiftDate(dateIso: string, days: number): string {
  const base = new Date(`${toDatePart(dateIso)}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return toDatePart(dateIso);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

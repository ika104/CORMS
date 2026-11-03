import { ICorrespondenceStub } from '../../models/ICorrespondence';

/**
 * CMS-014 AC4 — a "pending response" flag that stays open past a configurable deadline must be
 * escalated. The deadline is `pendingResponse.escalationDays` (CORMS_AdminConfig); the countdown
 * runs from when the flag was set (pendingResponseDetail.flaggedAt, persisted server-side). Kept
 * free of React/services so the rule is unit-testable and reusable by both the sent/supervisor
 * views (visible escalation state) and any scheduled job that sends the actual notification.
 */

export const DEFAULT_ESCALATION_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PendingResponseState = 'none' | 'pending' | 'overdue';

/** Parses the admin-config value into a positive number of days, falling back to the default for a
 * blank, non-numeric or non-positive value. */
export function parseEscalationDays(raw: string | undefined): number {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ESCALATION_DAYS;
}

/** The instant a flag becomes overdue: flaggedAt + `days`. Undefined when flaggedAt is missing or
 * unparseable, so callers treat it as "no deadline known" rather than immediately overdue. */
export function escalationDueAt(flaggedAt: string | undefined, days: number): string | undefined {
  if (!flaggedAt) return undefined;
  const flaggedMs = Date.parse(flaggedAt);
  if (Number.isNaN(flaggedMs)) return undefined;
  return new Date(flaggedMs + days * MS_PER_DAY).toISOString();
}

/**
 * The escalation state of an item: 'none' (not flagged), 'pending' (flagged, within the deadline),
 * or 'overdue' (flagged and past flaggedAt + days). A flagged item whose flaggedAt is unknown stays
 * 'pending' — never auto-escalated on missing data.
 */
export function pendingResponseState(
  item: Pick<ICorrespondenceStub, 'pendingResponse' | 'pendingResponseDetail' | 'expedited'>,
  days: number,
  nowIso: string = new Date().toISOString(),
  expeditedDays?: number
): PendingResponseState {
  if (!item.pendingResponse) return 'none';
  // CMS-015 AC4 — expedited items escalate sooner: when the item carries the expedite flag and a
  // shortened window is configured (escalation.expeditedDays), the deadline runs off the smaller of
  // the two, so an expedited pending item becomes escalation-due ahead of a normal one.
  const effectiveDays = item.expedited && expeditedDays !== undefined ? Math.min(days, expeditedDays) : days;
  const dueAt = escalationDueAt(item.pendingResponseDetail?.flaggedAt, effectiveDays);
  if (!dueAt) return 'pending';
  return Date.parse(nowIso) >= Date.parse(dueAt) ? 'overdue' : 'pending';
}

export function isEscalationOverdue(
  item: Pick<ICorrespondenceStub, 'pendingResponse' | 'pendingResponseDetail' | 'expedited'>,
  days: number,
  nowIso?: string,
  expeditedDays?: number
): boolean {
  return pendingResponseState(item, days, nowIso, expeditedDays) === 'overdue';
}

/** Every flagged item now past its escalation deadline — the set a scheduled escalation job would
 * notify on, and the set the sent/supervisor views badge as escalation-due. */
export function filterOverdueEscalations<T extends Pick<ICorrespondenceStub, 'pendingResponse' | 'pendingResponseDetail'>>(
  items: T[],
  days: number,
  nowIso?: string
): T[] {
  return items.filter((item) => isEscalationOverdue(item, days, nowIso));
}

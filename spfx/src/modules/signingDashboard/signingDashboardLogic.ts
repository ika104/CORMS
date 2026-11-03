/**
 * CMS-007 — pure signing-dashboard logic: search/filter (AC2) and the document-control action
 * transitions (AC3, resend / cancel). Kept free of React/service dependencies so the search
 * matching and the status rules are unit-testable on their own.
 */

import { normalizedContains } from '../../services/common/normalizedContains';
import {
  ISigningEvent,
  ISigningSession,
  ISigningSessionFilters,
  SigningSessionStatus,
} from '../../models/ISigningSession';

/** AC2 — search sessions by signer name, reference number and subject (free text), by status, and
 * by a createdAt date range. All supplied criteria must match. */
export function filterSigningSessions(
  sessions: ISigningSession[],
  filters?: ISigningSessionFilters
): ISigningSession[] {
  if (!filters) return sessions;
  return sessions.filter((session) => {
    if (filters.status && session.status !== filters.status) return false;
    if (filters.dateFrom && dateOnly(session.createdAt) < filters.dateFrom) return false;
    if (filters.dateTo && dateOnly(session.createdAt) > filters.dateTo) return false;
    if (filters.text && filters.text.trim()) {
      const term = filters.text.trim();
      const hit =
        normalizedContains(session.signerName, term) ||
        normalizedContains(session.referenceNumber, term) ||
        normalizedContains(session.subject, term);
      if (!hit) return false;
    }
    return true;
  });
}

function dateOnly(iso: string): string {
  return (iso ?? '').slice(0, 10);
}

/** AC3 — resend is only meaningful while the request is still out for (or awaiting) signature. */
export function canResend(status: SigningSessionStatus): boolean {
  return status === 'Sent' || status === 'Viewed' || status === 'Expired';
}

/** AC3 — cancel applies to a live, not-yet-terminal request. */
export function canCancel(status: SigningSessionStatus): boolean {
  return status === 'Sent' || status === 'Viewed';
}

function nextEvent(
  session: ISigningSession,
  event: string,
  actor: string,
  timestamp: string,
  detail?: string
): ISigningEvent {
  return { id: `${session.id}-ev-${session.events.length + 1}`, event, actor, timestamp, detail };
}

/** Records a resend: appends a 'Resent' history entry, refreshes sentAt/updatedAt, and re-opens an
 * expired request to 'Sent'. A status that can't be resent is returned unchanged. */
export function applyResend(session: ISigningSession, actor: string, timestamp: string): ISigningSession {
  if (!canResend(session.status)) return session;
  return {
    ...session,
    status: session.status === 'Expired' ? 'Sent' : session.status,
    sentAt: timestamp,
    updatedAt: timestamp,
    events: [...session.events, nextEvent(session, 'Resent', actor, timestamp)],
  };
}

/** The fields a new signing session is created from once the signing flow has raised the request. */
export interface INewSigningSessionInput {
  correspondenceId: string;
  referenceNumber: string;
  subject: string;
  signerName: string;
  signerEmail?: string;
  externalDocumentId?: string;
}

/** The opening history for a freshly-sent request: 'Created' then 'Sent', both stamped now. */
export function buildSigningSessionEvents(
  actor: string,
  timestamp: string,
  externalDocumentId?: string
): ISigningEvent[] {
  return [
    {
      id: 'ev-1',
      event: 'Created',
      actor,
      timestamp,
      detail: externalDocumentId ? `External document ${externalDocumentId}` : undefined,
    },
    { id: 'ev-2', event: 'Sent', actor, timestamp },
  ];
}

/** Assembles a brand-new 'Sent' signing session (id assigned by the caller/store). Pure so the mock
 * and the live SharePoint writer produce identical shapes. */
export function buildNewSigningSession(
  id: string,
  input: INewSigningSessionInput,
  actor: string,
  timestamp: string
): ISigningSession {
  return {
    id,
    correspondenceId: input.correspondenceId,
    referenceNumber: input.referenceNumber,
    subject: input.subject,
    signerName: input.signerName,
    signerEmail: input.signerEmail,
    status: 'Sent',
    createdAt: timestamp,
    sentAt: timestamp,
    updatedAt: timestamp,
    externalDocumentId: input.externalDocumentId,
    events: buildSigningSessionEvents(actor, timestamp, input.externalDocumentId),
  };
}

/** Records a cancellation: sets status Cancelled and appends the history entry. A status that
 * can't be cancelled is returned unchanged. */
export function applyCancel(
  session: ISigningSession,
  actor: string,
  timestamp: string,
  reason?: string
): ISigningSession {
  if (!canCancel(session.status)) return session;
  return {
    ...session,
    status: 'Cancelled',
    updatedAt: timestamp,
    events: [...session.events, nextEvent(session, 'Cancelled', actor, timestamp, reason)],
  };
}

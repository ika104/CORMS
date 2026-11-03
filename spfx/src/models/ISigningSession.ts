/**
 * CMS-007 — a digital-signature request tracked on the signing dashboard (list
 * CORMS_SigningSessions). The dashboard is modelled on commercial e-signature dashboards
 * (eSign / Adobe Sign): Document Control searches sessions by date / signer / reference / status
 * (AC2) and performs resend, cancel and view-history actions (AC3) without opening each item.
 *
 * The actual signing is handled by Power Automate flows (AC4/AC12) — creating the session from an
 * approved draft, signer notification, provider interaction and signed-document callback are flow
 * responsibilities. This model + dashboard tracks and manages the resulting requests.
 */

export type SigningSessionStatus = 'Sent' | 'Viewed' | 'Signed' | 'Declined' | 'Cancelled' | 'Expired';

export const SIGNING_SESSION_STATUSES: SigningSessionStatus[] = [
  'Sent',
  'Viewed',
  'Signed',
  'Declined',
  'Cancelled',
  'Expired',
];

/** One entry in a request's signing history (AC3 "view the signing history of a request"). */
export interface ISigningEvent {
  id: string;
  /** A short event key: 'Created' | 'Sent' | 'Viewed' | 'Signed' | 'Declined' | 'Resent' |
   * 'Cancelled' | 'Reminded' | 'Expired' — rendered via i18n on the dashboard. */
  event: string;
  actor: string;
  /** ISO timestamp of the event. */
  timestamp: string;
  detail?: string;
}

export interface ISigningSession {
  id: string;
  correspondenceId: string;
  referenceNumber: string;
  subject: string;
  /** Display name of the signer(s); multiple are joined with "; " for the dashboard's signer search. */
  signerName: string;
  signerEmail?: string;
  /** Opaque identifier held by the external signing system, never interpreted by SPFx. */
  externalDocumentId?: string;
  status: SigningSessionStatus;
  /** ISO date/time the request was created and (last) sent for signature. */
  createdAt: string;
  sentAt?: string;
  signedAt?: string;
  /** ISO timestamp of the last status change / document-control action. */
  updatedAt: string;
  events: ISigningEvent[];
}

/** Dashboard search/filter criteria (AC2). All optional and AND-combined. */
export interface ISigningSessionFilters {
  /** Free text matched against signer name, reference number and subject. */
  text?: string;
  status?: SigningSessionStatus;
  /** Inclusive createdAt lower/upper bounds as YYYY-MM-DD. */
  dateFrom?: string;
  dateTo?: string;
}

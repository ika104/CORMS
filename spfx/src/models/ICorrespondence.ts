import { StatusBadgeTone } from '../components/common/StatusBadge';

export type CorrespondenceStatus =
  | 'Draft'
  | 'PendingNumber'
  | 'Registered'
  | 'InReview'
  | 'Approved'
  | 'Rejected'
  | 'Signed'
  | 'Declared'
  | 'Delivered';

export type CorrespondenceDirection = 'Incoming' | 'Outgoing' | 'External';
export type CorrespondencePriority = 'Normal' | 'High';

export interface ISecurityTier {
  tier: number;
  name: string;
  short: string;
  color: string;
  bg: string;
}

export const SECURITY_TIERS: ISecurityTier[] = [
  { tier: 1, name: 'Public / Unclassified', short: 'Public', color: '#107c10', bg: '#dff6dd' },
  { tier: 2, name: 'Restricted', short: 'Restricted', color: '#0070d0', bg: '#e8f0fb' },
  { tier: 3, name: 'Confidential', short: 'Confidential', color: '#835b00', bg: '#fff4ce' },
  { tier: 4, name: 'Secret', short: 'Secret', color: '#8b3a00', bg: '#fce4d6' },
  { tier: 5, name: 'Top Secret', short: 'Top Secret', color: '#c50f1f', bg: '#fde7e9' },
];

export const STATUS_CONFIG: Record<CorrespondenceStatus, { label: string; color: string; bg: string }> = {
  Draft: { label: 'Draft', color: '#605e5c', bg: '#f3f2f1' },
  PendingNumber: { label: 'Pending Number', color: '#835b00', bg: '#fff4ce' },
  Registered: { label: 'Registered', color: '#0070d0', bg: '#e8f0fb' },
  InReview: { label: 'In Review', color: '#0070d0', bg: '#e8f0fb' },
  Approved: { label: 'Approved', color: '#107c10', bg: '#dff6dd' },
  Rejected: { label: 'Rejected', color: '#c50f1f', bg: '#fde7e9' },
  Signed: { label: 'Signed', color: '#107c10', bg: '#dff6dd' },
  Declared: { label: 'Declared', color: '#5c2d91', bg: '#f4eafb' },
  Delivered: { label: 'Delivered', color: '#107c10', bg: '#dff6dd' },
};

// Tone for the shared StatusBadge component — kept alongside STATUS_CONFIG (color/bg)
// rather than replacing it, since MyCorrespondenceView's local badge still reads that one.
const STATUS_TONE: Record<CorrespondenceStatus, StatusBadgeTone> = {
  Draft: 'neutral',
  PendingNumber: 'warning',
  Registered: 'info',
  InReview: 'info',
  Approved: 'success',
  Rejected: 'danger',
  Signed: 'success',
  Declared: 'purple',
  Delivered: 'success',
};

export function correspondenceStatusTone(_status: CorrespondenceStatus): StatusBadgeTone {
  // Client feedback: the list/card screens carried too much colour. Status is now shown as a plain
  // neutral tag everywhere; only the Expedited flag stays coloured (red). STATUS_TONE is retained
  // above as the reference mapping in case a per-status colour is wanted again.
  return 'neutral';
}

export interface IAwaitedParty {
  type: 'Internal' | 'External';
  name: string;
}

/** CMS-014's richer flag detail. Kept alongside the existing `pendingResponse` boolean rather
 * than replacing it — MyCorrespondenceView's "Pending" KPI and Team Inbox's status already
 * read that boolean, so both are set/cleared together whenever this detail changes.
 * TODO(confirm): collapse into a single field once those existing boolean readers are revisited. */
export interface IPendingResponseDetail {
  awaitedParty: IAwaitedParty;
  flaggedAt: string;
  flaggedBy: string;
}

/** CMS-015 — distinct from `priority: 'High'`, which the pre-existing bulk Expedite action
 * already sets; this captures the reason/actor/timestamp the story requires. */
export interface IExpediteDetail {
  reason: string;
  expeditedBy: string;
  expeditedAt: string;
}

export interface ICorrespondenceStub {
  id: string;
  referenceNumber: string;
  subject: string;
  type: string;
  /** The document-library content type (for example Letter or Memo), distinct from `type`,
   * which is the correspondence direction retained for legacy card labels. */
  contentType?: string;
  direction: CorrespondenceDirection;
  status: CorrespondenceStatus;
  priority: CorrespondencePriority;
  securityTier: number;
  department: string;
  assignedTo?: string;
  createdAt: string;
  senderName?: string;
  recipientName?: string;
  currentReviewer?: string;
  /** CMS-040 Details tab — the department the item is currently routed to (distinct from
   * `department`, the creation-time destination). Owned by Triage & Routing; empty until that
   * epic's backend task populates CORMS_Correspondence.CurrentDepartment. */
  currentDepartment?: string;
  /** CMS-011 AC3 — the next action a triaging officer routed this item with (Review / Approve /
   * Sign / Distribute / Archive), shown to the recipient as the named "Next Step". Stored as a
   * plain string (the NextAction column) rather than the module's NextAction union to keep the
   * shared model free of a module import. */
  nextAction?: string;
  /** CMS-011 AC6 — who routed the item and when. */
  routedBy?: string;
  routedAt?: string;
  dueDate?: string;
  pendingResponse?: boolean;
  pendingResponseDetail?: IPendingResponseDetail;
  expedited?: IExpediteDetail;
  signatureRequired?: boolean;
  isSigned?: boolean;
  chainId?: string;
  parentId?: string;
  /** CMS-022 — how many items are in this item's chain. Set when a list collapses a chain to one
   * row (groupByChain) so the row can show the count; 1 (or unset) for a standalone item. */
  chainCount?: number;
  seen?: boolean;
  hasAttachment?: boolean;
  /** Links to IRecordClassification.id (ICorrespondenceMetadata.ts) — used by custom-folder criteria. */
  recordClassificationId?: string;
  /** CMS-041 — the file-plan classification (stored as a single string) and the originating
   * function, carried on the stub so a reply started from a list can pre-fill these core fields. */
  recordClassificationName?: string;
  originatingFunction?: string;
  /** CMS-026 AC3 — a full-text snippet around the matched keyword, populated only for rows that
   * came back from a keyword search (from the Elasticsearch `highlight` fragment live, or a
   * windowed excerpt of the searchable text in mock mode). Absent for non-search listings. */
  searchSnippet?: string;
  /** CMS-037 AC4 — the approved template an OUTGOING item's body was authored from (id) and the
   * version in force at authoring time. Carried on the mock fixture as template provenance; the live read side surfaces these on ICorrespondenceDetail,
   * not on shared list stubs (the shared list $select must not name the additive column). */
  templateReference?: string;
  templateVersion?: number;
}

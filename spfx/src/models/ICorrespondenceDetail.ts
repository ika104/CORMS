import { ICorrespondenceStub } from './ICorrespondence';
import { IPhysicalDispatch } from './IPhysicalDispatch';

export interface IAttachment {
  id: string;
  name: string;
  /** No page-count data source exists yet (CORMS_Attachments carries no such field) — optional
   * rather than fabricated; callers that need a number for layout purposes default to 1. */
  pages?: number;
  /** "SharePoint library" or "RecordHub · {record number}" for reference-only attachments (CMS-003). */
  source: string;
  /** The system-identified "main letter" for this correspondence — at most one per item. */
  isMain: boolean;
  /** CMS-034 AC6/AC7 — the attachment's own security classification tier, stored independently of
   * the parent correspondence. Undefined for pre-CMS-034 rows with no classification column. */
  securityTier?: number;
  /** SharePoint document URL — preview/download open this directly; the Preview tab's "Open
   * Document" action also opens the main attachment's url so the user can edit/view/download/print
   * from SharePoint's own UI, rather than duplicating those actions here. */
  url?: string;
}

/** A physical (paper) attachment reference (CORMS_PhysicalAttachments) — a shelf/storage pointer,
 * not a file, so it deliberately doesn't share IAttachment's shape (no pages/source/isMain/url). */
export interface IPhysicalAttachmentStub {
  id: string;
  resourceIdentifier: string;
  storageLocation: string;
  description: string;
}

/** CMS-040 Files tab — uploaded/scanned/reference files and physical (paper) items are distinct
 * data sources with distinct shapes, joined here rather than forced into one list. */
export interface IAttachmentsResult {
  uploaded: IAttachment[];
  physical: IPhysicalAttachmentStub[];
}

export interface ISecurityPrincipal {
  id: string;
  principal: string;
  permissionLevel: string;
  type: 'User' | 'SharePoint Group';
}

export interface IAuditEntry {
  id: string;
  seq: number;
  action: string;
  actor: string;
  details: string;
  timestamp: string;
}

export type TimelineEventKind =
  | 'created'
  | 'edited'
  | 'submitted'
  | 'referenceAssigned'
  | 'routed'
  | 'approved'
  | 'rejected'
  | 'signatureRequested'
  | 'signed'
  | 'emailSent'
  | 'reminder'
  | 'reply'
  | 'expedited'
  | 'delivered'
  | 'acknowledged'
  | 'reassigned';

export interface ITimelineEvent {
  id: string;
  kind: TimelineEventKind;
  actor: string;
  details: string;
  timestamp: string;
}

export type FollowUpType =
  '1st Follow-up' | '2nd Follow-up Letter' | '3rd Follow-up Letter (Final)' | 'Escalation Notice';

export interface IReminder {
  date: string;
  followUpType: FollowUpType;
  note: string;
}

/** Enclosing business-activity File and its position in the file plan (CMS-027). TODO(confirm): whether
 * File info gets its own tab or stays inside Details, per Figma once available — modelled here either way. */
export interface IFilePlanInfo {
  fileNumber: string;
  fileName: string;
  filePlanPosition: string;
}

// CMS-020/021 — Delivery & Acknowledgement, surfaced as a sub-section inside the Details tab.
// TODO(confirm): no Figma frame yet — modeled on shared components + story ACs; the physical
// mail dispatch-method field set (Courier/In-Person/Postal) mirrors the story text, since
// Create Correspondence's own Delivery Options today only captures two booleans
// (deliveryEmail/deliveryPhysicalMail) with no dispatch-method wizard yet to reuse verbatim.
export type DeliveryChannelType = 'Email' | 'PhysicalMail';
export type DeliveryStatus = 'Sent' | 'Delivered' | 'Failed';
export type DispatchMethod = 'Courier' | 'InPerson' | 'Postal';

export interface IDeliveryChannel {
  channel: DeliveryChannelType;
  status: DeliveryStatus;
  timestamp?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  dispatchMethod?: DispatchMethod;
  courierName?: string;
  trackingNumber?: string;
  bearerName?: string;
  bearerDate?: string;
  postalService?: string;
  receiptNumber?: string;
}

export interface IDeliveryRecipient {
  id: string;
  name: string;
  isCc: boolean;
  channels: IDeliveryChannel[];
}

/**
 * CMS-040 Part 1 — header/Details-tab fields only. Attachments/Security/Audit/Timeline/Thread/
 * Reminder each moved to their own independently-callable, independently-clearance-gated
 * ICorrespondenceDetailService method (getAttachments/getSecurityAssignments/getAuditTrail/
 * getTimeline/getThread/getReminder) instead of being eagerly bundled into one aggregate object —
 * see that interface's file comment. A caller that only ever calls getDetail() no longer receives
 * (and can no longer accidentally leak) another tab's data.
 */
export interface ICorrespondenceDetail extends ICorrespondenceStub {
  // originatingFunction and recordClassificationName are inherited from ICorrespondenceStub (CMS-041).
  /** RecordHub content type (Letter/Memo/Report) — CORMS_Correspondence.ContentTypeName. Distinct
   * from the inherited `type`/`direction` (both Incoming/Outgoing); surfaced so the Details tab
   * shows the real content type the originator picked, not just the direction. */
  contentType?: string;
  /** How the correspondence was received — the Channel option chosen at creation
   * (CORMS_Correspondence.Channel; Email/Scan/Fax by default). */
  channel?: string;
  /** Free-text reason shown alongside High priority. */
  priorityReason?: string;
  comment?: string;
  filePlan?: IFilePlanInfo;
  delivery?: IDeliveryRecipient[];
  /** Delivery Options chosen on the correspondence (CMS-020). Email is the default channel;
   * physicalDispatch carries the Physical Mail wizard's captured method + details (courier +
   * dynamic fields, or bearer/postal), persisted as JSON. */
  deliveryEmail?: boolean;
  deliveryPhysicalMail?: boolean;
  physicalDispatch?: IPhysicalDispatch;
  /** CMS-008 — manual declaration (status 'Declared'). Present once the record has been declared:
   * the declaring user (AC3), the ISO timestamp (AC3), and the record serial number stamped for
   * filing/retrieval (AC7). The record classification is carried by recordClassificationName. */
  declaredBy?: string;
  declaredAt?: string;
  recordSerialNumber?: string;
  /** CMS-037 AC4 — the approved template this OUTGOING item's body was authored from (the template
   * id) and the template version in force at authoring time, stamped at creation. Absent for
   * incoming/uploaded items and for outgoing items not authored from a template. It is provenance
   * only and does not affect declaration or delivery. */
  templateReference?: string;
  templateVersion?: number;
  /** The requestor marked the main document as already signed at creation, so it has no approvals. */
  mainDocumentSigned?: boolean;
  /** Whether the signed-in user created this correspondence. Only the requestor manages its
   * approvers — no role, including administrators, overrides this. */
  viewerIsRequestor?: boolean;
}

/** CMS-008 — the outcome of a manual Declare Record action. */
export interface IDeclarationResult {
  declaredBy: string;
  declaredAt: string;
  recordSerialNumber: string;
  /** The record classification stamped on the declared record (AC7). */
  recordClassification?: string;
}

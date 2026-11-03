import { AttachmentSource } from '../../../models/IAttachmentRecord';
import { IPhysicalDispatch } from '../../../models/IPhysicalDispatch';

export type CorrespondenceTypeValue = 'Outgoing' | 'Incoming';
export type PriorityValue = 'Normal' | 'High';
export type DestinationTypeValue = 'Internal' | 'External';
export type ComposeMode = 'upload' | 'template' | 'existing';
export type SupportingDocsMode = 'upload' | 'attach';
export type ApprovalMode = 'any' | 'all';

export interface ISignaturePlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IApprovalStepBase {
  id: string;
  requireSignature: boolean;
  signaturePlacement: ISignaturePlacement;
}

export interface IReviewerStep extends IApprovalStepBase {
  kind: 'reviewer';
  userId: string;
  userName: string;
  department?: string;
}

export interface IDepartmentStep extends IApprovalStepBase {
  kind: 'department';
  departmentId: string;
  departmentName: string;
  /** 'any' = a single member's approval is enough; 'all' = every member in seniority order must approve. */
  mode: ApprovalMode;
}

export interface IGroupStep extends IApprovalStepBase {
  kind: 'group';
  groupName: string;
  memberIds: string[];
  memberNames: string[];
  mode: ApprovalMode;
}

export type ApprovalStep = IReviewerStep | IDepartmentStep | IGroupStep;

/**
 * File bytes picked or scanned in the browser, held in memory until Save Draft/Send actually
 * persists them (persistPendingAttachments) — shared by the Compose tab's main document and by
 * every supporting document so both carry provenance through to CORMS_Attachments identically,
 * rather than each re-declaring its own parallel set of pending-* fields.
 */
export interface IPendingFile {
  content: Blob;
  /** Written straight through to CORMS_Attachments.Source, so a scanned document is never
   * recorded as an upload. 'RecordHubReference' is excluded — a reference has no file of its own. */
  source: Exclude<AttachmentSource, 'RecordHubReference'>;
  /** Scan-quality metadata, present only for a 'Scanned' entry. */
  scannedDPI?: number;
  /** A scan-quality override reason accepted at scan time, applied via
   * attachmentService.recordQualityOverride() once the real row exists. */
  qualityOverrideReason?: string;
  /** CMS-034 AC6/AC7 — this attachment's own security classification tier. Undefined means "inherit
   * the parent correspondence's classification" (resolved at persist time); a set value is an
   * explicit per-attachment override (up or down) the capturer chose. */
  securityTier?: number;
}

export interface ISupportingDocument {
  id: string;
  name: string;
  source: 'upload' | 'recordhub-reference';
  /** Set when source is 'recordhub-reference' — the RecordHub record number the reference points at. */
  recordNumber?: string;
  /** Canonical URL of a document selected through the RecordsHub site/library browser. */
  recordHubReferenceUrl?: string;
  /** CORMS_Attachments row id, once persisted (CMS-001 AC6/AC7) — lets removal clean up the
   * backend row too, not just local form state. Absent means this entry is still local-only,
   * waiting for persistPendingAttachments to run at Save Draft/Send time. */
  attachmentId?: string;
  /** Real file bytes plus their provenance, held in memory until Save Draft/Send actually persists
   * this document — present only for a not-yet-uploaded 'upload' entry (undefined once
   * attachmentId is set, and never set for 'recordhub-reference', which has no file of its own). */
  pending?: IPendingFile;
  /** CMS-034 AC6/AC7 — this supporting document's own classification tier. Held here (not only on
   * `pending`) so a 'recordhub-reference' entry, which has no pending file, can still carry an
   * override. Undefined means inherit the parent correspondence's classification at persist time. */
  securityTier?: number;
}

export interface IPhysicalAttachment {
  id: string;
  description: string;
  storageLocation: string;
  /** Server-generated (PHY-{year}-{serial}) once persisted at Save Draft/Send time — absent for a
   * not-yet-persisted local entry. */
  resourceId?: string;
}

/** The Compose Document tab's "the document" — the same pending-file payload every supporting
 * document carries, plus the file name the Compose tab picks separately from the bytes. */
export interface IPendingMainDocument extends IPendingFile {
  fileName: string;
}

export const DEFAULT_SIGNATURE_PLACEMENT: ISignaturePlacement = {
  page: 1,
  x: 70,
  y: 85,
  width: 20,
  height: 8,
};

export interface ICreateCorrespondenceFormState {
  correspondenceType: CorrespondenceTypeValue;
  priority: PriorityValue;
  contentTypeId?: string;
  contentTypeName?: string;
  /** Channel DDL selection — the chosen option id (Email/Scan/Fax by default, from
   * admin.channelsJson). Single-select; persisted to CORMS_Correspondence.Channel. */
  channel?: string;
  subject: string;
  originatingFunction?: string;
  referenceNumber?: string;
  sender: string;
  /** Stable SharePoint/AAD identity selected in the single sender people picker. */
  senderId?: string;
  /** Recipients selected via the SharePoint people picker (multi-value). Parallel arrays of the
   * login/claims key and display name, mirroring destinationDepartmentIds/Names. */
  recipientIds: string[];
  recipientNames: string[];
  dateCreated: string;
  dueDate?: string;
  securityTier?: number;
  recordClassificationId?: string;
  recordClassificationLabel?: string;
  /** CMS-034 AC3 — the selected classification's active/retired state, resolved when it's picked
   * (always true from the active-only list) or re-resolved for a reopened draft / reply prefill.
   * `false` blocks Send with an explanatory message; undefined = not yet resolved (treated as
   * allowed, mirroring the "unknown is allowed" stance elsewhere). */
  recordClassificationActive?: boolean;
  destinationType: DestinationTypeValue;
  destinationDepartmentIds: string[];
  destinationDepartmentNames: string[];
  externalOrgIds: string[];
  externalOrgNames: string[];
  deliveryEmail: boolean;
  deliveryPhysicalMail: boolean;
  /** Physical-mail dispatch details captured by the Physical Mail wizard (CMS-020) — present only
   * once deliveryPhysicalMail is on and the wizard has been submitted; cleared when it's turned off. */
  physicalDispatch?: IPhysicalDispatch;
  comments: string;

  composeMode: ComposeMode;
  selectedTemplateId?: string;
  /** CMS-037 AC4 — the version of the selected template at the moment it was applied, carried on the
   * payload so it's stamped onto the correspondence at creation time. */
  selectedTemplateVersion?: number;
  templateHeader: string;
  templateFooter: string;
  bodyHtml: string;
  bodyDir: 'ltr' | 'rtl';
  uploadedDocumentName?: string;
  scannedDocumentName?: string;
  /** Name of a document pulled in from an existing SharePoint library (Existing Document tab). Its
   * bytes are held in pendingMainDocument like any picked file; this drives the compose display and
   * the Send-time "a document exists" check, kept separate so its provenance reads correctly. */
  existingDocumentName?: string;
  /** Canonical absolute source URL for an Existing Document reference; never copied as bytes. */
  existingDocumentUrl?: string;
  /** The requestor states the uploaded/existing main document already carries its signatures, so
   * no approval chain or signing is needed. Only effective for an Outgoing file-based document —
   * read it through isMainDocumentSigned(), never directly. */
  mainDocumentSigned: boolean;
  /** Real bytes for uploadedDocumentName/scannedDocumentName, held in memory until Save Draft/Send
   * — see IPendingMainDocument. Cleared once persistPendingAttachments has uploaded it for real. */
  pendingMainDocument?: IPendingMainDocument;

  supportingDocsMode: SupportingDocsMode;
  supportingDocuments: ISupportingDocument[];
  physicalAttachments: IPhysicalAttachment[];

  approvalSteps: ApprovalStep[];

  /** Create Correspondence backend task — set once the correspondence row exists (returned by
   * the first successful correspondenceService.create() call this session), so a second Save
   * Draft click updates that row instead of inserting a duplicate. */
  existingId?: string;

  /** CMS-022 — when composing a reply, the parent's chain id and item id, so the created item
   * joins the parent's thread (inherits its controlled number) instead of starting a new chain. */
  chainId?: string;
  parentReplyToId?: string;
}

// securityTier starts unset (not defaulted to the user's max clearance) so Send requires an
// explicit, informed choice — matches the prototype.
export function createInitialFormState(
  senderName: string,
  senderId?: string
): ICreateCorrespondenceFormState {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  return {
    correspondenceType: 'Outgoing',
    priority: 'Normal',
    subject: '',
    sender: senderName,
    senderId,
    recipientIds: [],
    recipientNames: [],
    dateCreated: iso,
    securityTier: undefined,
    destinationType: 'Internal',
    destinationDepartmentIds: [],
    destinationDepartmentNames: [],
    externalOrgIds: [],
    externalOrgNames: [],
    deliveryEmail: true,
    deliveryPhysicalMail: false,
    comments: '',
    composeMode: 'upload',
    mainDocumentSigned: false,
    templateHeader: '',
    templateFooter: '',
    bodyHtml: '',
    bodyDir: 'ltr',
    supportingDocsMode: 'upload',
    supportingDocuments: [],
    physicalAttachments: [],
    approvalSteps: [],
  };
}

/** Whether this submission skips approvals because its main document is already signed. A
 * template-authored letter is generated by CORMS, so it can never arrive pre-signed. */
export function isMainDocumentSigned(state: ICreateCorrespondenceFormState): boolean {
  return (
    state.mainDocumentSigned && state.correspondenceType === 'Outgoing' && state.composeMode !== 'template'
  );
}

export interface IFormErrors {
  [field: string]: string | undefined;
}

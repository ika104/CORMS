import { CorrespondenceDirection, CorrespondencePriority } from './ICorrespondence';
import { IPhysicalDispatch } from './IPhysicalDispatch';
import { IApprovalChainStep } from './IApprovalChain';

/**
 * The Create Correspondence screen's write payload — one field per Part 1's mapping list of the
 * Create Correspondence backend task. Deliberately separate from ICreateCorrespondenceFormState
 * (src/modules/createCorrespondence/state/types.ts), which is the form's own UI-shaped state
 * (ids/names pairs for searchable selects, compose-mode fields the backend never sees, etc.) —
 * CreateCorrespondenceView builds one of these from form.state before calling
 * ICorrespondenceService.create().
 */
export interface ICreateCorrespondencePayload {
  /** SharePoint item id of an already-created draft (from a prior Save Draft call this session) —
   * present means update-in-place instead of insert, so repeated Save Draft clicks don't create
   * duplicate rows. Never set for a brand-new item. */
  existingId?: string;

  /** CMS-022 — the chain (thread) identifier this item belongs to. A reply inherits its parent's
   * chainId (the parent's constant controlled number); a brand-new correspondence leaves it unset
   * and starts its own chain at submission (chainId := the issued reference number). */
  chainId?: string;
  /** CMS-022 — the SharePoint item id of the parent this item replies to (empty for a new chain). */
  parentId?: string;

  subject: string;
  direction: CorrespondenceDirection;
  priority: CorrespondencePriority;
  /** RecordHub content type (e.g. Letter/Memo/Report) — CORMS_Correspondence.ContentTypeName
   * (named to avoid colliding with SharePoint's own built-in ContentType navigation property, see
   * listSchemas.ts). Distinct from `direction`, which also feeds
   * CORMS_Correspondence.CorrespondenceType — see buildCorrespondenceRowForWrite's file comment
   * (mapCorrespondenceRow.ts) for why these are two separate columns fed by two separate UI
   * fields, per CMS-001 AC9. */
  contentType?: string;
  /** How the correspondence was received — the Channel DDL's chosen option id (Email/Scan/Fax by
   * default, sourced from admin.channelsJson). Persisted to CORMS_Correspondence.Channel. */
  channel?: string;
  originatingFunction?: string;
  /** Numeric tier (1..5, see SECURITY_TIERS) — same shape the form already carries
   * (ICreateCorrespondenceFormState.securityTier). Converted to CORMS_Correspondence's
   * SecurityLevel Choice string by the write mapper (clearance.ts's tierToSecurityLevel), same
   * source of truth the read side (clearance.ts's securityLevelToTier) already uses. */
  securityTier?: number;
  recordClassification?: string;
  destinationType: 'Internal' | 'External';
  destinationDepartments: string[];
  externalOrganizations: string[];
  sender: string;
  senderId?: string;
  /** Existing Records Hub document reference; CORMS does not copy its bytes. */
  existingDocumentUrl?: string;
  existingDocumentName?: string;
  recipient?: string;
  dueDate?: string;
  deliveryEmail: boolean;
  deliveryPhysicalMail: boolean;
  /** Physical-mail dispatch details captured by the wizard (CMS-020) — persisted as JSON; on send
   * the backend generates the follow-up dispatch task from it. */
  physicalDispatch?: IPhysicalDispatch;
  comments?: string;
  /** Incoming rejects this outright (defense-in-depth, CMS-001 AC3) — the client already never
   * lets an Incoming item reach a template. For an Outgoing item this is the approved template the
   * body was authored from; persisted as optional provenance. */
  templateReference?: string;
  /** CMS-037 AC4 — the version of `templateReference` in force when the body was authored, captured
   * at creation time so a declared/delivered record carries the exact template revision it was built
   * from. Only meaningful alongside a templateReference (Outgoing, template-authored). */
  templateVersion?: number;

  /** CMS-005 AC15 — the print-ready HTML of the completed correspondence: the interpolated
   * letterhead header, the authored body, the auto sign-off and the footer assembled into one
   * document (composePrintableDocument). This is what gets rendered to PDF to become the
   * correspondence's main document before it is routed for approval; the binary PDF conversion
   * itself is a downstream server step. Present only for an Outgoing item authored from a template. */
  composedDocumentHtml?: string;

  /** CMS-006 AC9/AC12 — the structured approval chain (ordered Reviewer/Department/Group steps with
   * their participants, Any/All mode and signature placement) built in the workflow section. On
   * Send this is the contract the SharePoint Task workflow (orchestrated by Power Automate) reads to
   * create one Task per participant and run the steps in order. Present only for Outgoing items with
   * at least one step; the routing runtime (task lifecycle, approve/reject/return, notifications) is
   * the downstream orchestration this feeds. Serialised via buildApprovalChainPayload. */
  approvalChain?: IApprovalChainStep[];
  /** The Outgoing main document was uploaded already signed: Send files it as 'Signed' and no
   * approval chain is routed. */
  mainDocumentSigned?: boolean;
}

/**
 * A draft's persisted fields, reverse-mapped from its CORMS_Correspondence row so the Create
 * Correspondence screen can reopen it in edit mode (see mapCorrespondenceRowToDraftForm). Only the
 * fields the create screen actually persists are carried — recipients/departments/organizations
 * come back as display names (that's all the row stores), which the form uses as both id and label.
 */
export interface IDraftEditData {
  existingId: string;
  /** CMS-022 — chain/parent linkage, so reopening a drafted reply keeps it in its thread. */
  chainId?: string;
  parentId?: string;
  subject: string;
  /** The Create screen only authors Outgoing/Incoming (its Correspondence Type selector) — the
   * 3-way CorrespondenceDirection's 'External' never originates here, so this stays the narrower
   * union the form's correspondenceType field expects. */
  direction: 'Outgoing' | 'Incoming';
  priority: CorrespondencePriority;
  contentType?: string;
  channel?: string;
  originatingFunction?: string;
  securityTier?: number;
  recordClassification?: string;
  destinationType: 'Internal' | 'External';
  destinationDepartments: string[];
  externalOrganizations: string[];
  sender?: string;
  senderId?: string;
  existingDocumentUrl?: string;
  existingDocumentName?: string;
  recipients: string[];
  dateCreated: string;
  dueDate?: string;
  deliveryEmail: boolean;
  deliveryPhysicalMail: boolean;
  physicalDispatch?: IPhysicalDispatch;
  comments: string;
  mainDocumentSigned: boolean;
}

export interface ICreateCorrespondenceResult {
  id: string;
  /** 'Signed' when an Outgoing main document was submitted already signed. */
  status: 'Draft' | 'Registered' | 'Signed';
  referenceNumber?: string;
  /** The DateCreated stamped on the row by this call — returned rather than re-derived by the
   * caller from `new Date()`, so it can never disagree with the row itself. */
  dateCreated: string;
}

export interface ICorrespondenceValidationError {
  field: string;
  message: string;
}

/** Thrown by ICorrespondenceService.create() on a submit-mode validation failure or an
 * Incoming+template rejection — callers can read `.errors` for field-level detail. */
export class CorrespondenceValidationError extends Error {
  public readonly errors: ICorrespondenceValidationError[];

  constructor(errors: ICorrespondenceValidationError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join('; '));
    this.name = 'CorrespondenceValidationError';
    this.errors = errors;
    // TS compiling `extends Error` down to ES5 breaks `instanceof` unless the prototype chain is
    // restored explicitly — this project's SPFx tsconfig targets ES5 (tsconfig-base.json).
    Object.setPrototypeOf(this, CorrespondenceValidationError.prototype);
  }
}

import { CorrespondenceStatus, ICorrespondenceStub } from '../../models/ICorrespondence';
import { IExpediteDetail } from '../../models/ICorrespondence';
import { ICreateCorrespondencePayload, IDraftEditData } from '../../models/ICorrespondencePayload';
import { parsePhysicalDispatch } from '../../models/IPhysicalDispatch';
import { securityLevelToTier, tierToSecurityLevel } from './clearance';

/** CORMS_Correspondence row shape as read over REST/PnPjs, person fields expanded to `{Title}`.
 * TODO(confirm): the SharePoint list schema (listSchemas.ts) and the front-end ICorrespondenceStub
 * model were built in separate tasks and don't line up field-for-field (e.g. Direction only has
 * 'Incoming'/'Outgoing' on the list vs a 3-way union on the model; Status has 'In Review' with a
 * space vs 'InReview'; the model's 'PendingNumber' status has no list-side equivalent yet). This
 * mapper is the one place that reconciles the two shapes — see mapStatus/mapStatusToListValue. */
export interface ICorrespondenceListItem {
  Id: number;
  Title?: string;
  ReferenceNo?: string;
  Direction?: string;
  CorrespondenceType?: string;
  ContentTypeName?: string;
  Priority?: string;
  SecurityLevel?: string;
  DestinationDepartments?: string;
  Sender?: { Id?: number; Title?: string };
  Recipient?: string;
  AssignedTo?: { Title?: string };
  DateCreated?: string;
  DueDate?: string;
  Status?: string;
  ThreadId?: string;
  ParentReplyToId?: string;
  PendingResponse?: boolean;
  PendingResponseParty?: string;
  PendingResponsePartyType?: string;
  PendingResponseFlaggedAt?: string;
  PendingResponseFlaggedBy?: string;
  ExpeditedFlag?: boolean;
  ExpeditedReason?: string;
  ExpeditedBy?: { Title?: string };
  ExpeditedAt?: string;
  CurrentDepartment?: string;
  CurrentReviewer?: { Title?: string };
  NextAction?: string;
  RoutedBy?: string;
  RoutedAt?: string;
  OriginatingFunction?: string;
  RecordClassification?: string;
  ExistingDocumentUrl?: string;
  ExistingDocumentName?: string;
}

const LIST_TO_MODEL_STATUS: Record<string, CorrespondenceStatus> = {
  Draft: 'Draft',
  Registered: 'Registered',
  'In Review': 'InReview',
  // Rows saved by an earlier setStatus that wrote the model token instead of the list choice.
  InReview: 'InReview',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Signed: 'Signed',
  Declared: 'Declared',
  Delivered: 'Delivered',
};

const MODEL_TO_LIST_STATUS: Record<string, string> = {
  Draft: 'Draft',
  Registered: 'Registered',
  InReview: 'In Review',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Signed: 'Signed',
  Declared: 'Declared',
  Delivered: 'Delivered',
  // No SharePoint-list equivalent yet — a status filter of 'PendingNumber' can never match a
  // real row, rather than silently falling back to some other status.
  PendingNumber: 'PendingNumber',
};

export function mapStatus(raw: string | undefined): CorrespondenceStatus {
  return (raw && LIST_TO_MODEL_STATUS[raw]) || 'Draft';
}

export function mapStatusToListValue(status: CorrespondenceStatus): string {
  return MODEL_TO_LIST_STATUS[status] ?? status;
}

export function mapCorrespondenceRowToStub(item: ICorrespondenceListItem): ICorrespondenceStub {
  const expedited: IExpediteDetail | undefined = item.ExpeditedFlag
    ? {
        reason: item.ExpeditedReason ?? '',
        expeditedBy: item.ExpeditedBy?.Title ?? '',
        expeditedAt: item.ExpeditedAt ?? '',
      }
    : undefined;

  return {
    id: String(item.Id),
    referenceNumber: item.ReferenceNo ?? '',
    subject: item.Title ?? '',
    type: item.CorrespondenceType ?? '',
    contentType: item.ContentTypeName || undefined,
    // The list only has 'Incoming'/'Outgoing' (no 'External') — see file-comment TODO(confirm).
    direction: item.Direction === 'Outgoing' ? 'Outgoing' : 'Incoming',
    status: mapStatus(item.Status),
    priority: item.Priority === 'High' ? 'High' : 'Normal',
    securityTier: securityLevelToTier(item.SecurityLevel),
    department: normalizeDisplayList(item.DestinationDepartments),
    assignedTo: item.AssignedTo?.Title,
    createdAt: item.DateCreated ?? '',
    senderName: item.Sender?.Title,
    recipientName: item.Recipient,
    dueDate: item.DueDate,
    expedited,
    // CMS-022 — the chain is identified by its one controlled number (AC4). Prefer the explicit
    // ThreadId, but fall back to the ReferenceNo so items that share a controlled number still
    // group/thread together even when an older parent's ThreadId hasn't been backfilled yet.
    chainId: item.ThreadId || item.ReferenceNo || undefined,
    parentId: item.ParentReplyToId || undefined,
    pendingResponse: item.PendingResponse === true || undefined,
    // CMS-014 — the awaited party + flag timestamp, when the flag is set. flaggedAt drives the
    // escalation deadline (AC4). Only populated for a flagged item.
    pendingResponseDetail:
      item.PendingResponse === true && item.PendingResponseFlaggedAt
        ? {
            awaitedParty: {
              name: item.PendingResponseParty ?? '',
              type: item.PendingResponsePartyType === 'External' ? 'External' : 'Internal',
            },
            flaggedAt: item.PendingResponseFlaggedAt,
            flaggedBy: item.PendingResponseFlaggedBy ?? '',
          }
        : undefined,
    // CMS-040 — owned by Triage & Routing / the Approval Workflow respectively; both empty until
    // those epics' own backend tasks populate them. Render '—' rather than fabricate a value.
    currentDepartment: item.CurrentDepartment || undefined,
    currentReviewer: item.CurrentReviewer?.Title || undefined,
    // CMS-011 — the routed next action + routing attribution (AC3/AC6).
    nextAction: item.NextAction || undefined,
    routedBy: item.RoutedBy || undefined,
    routedAt: item.RoutedAt || undefined,
    // CMS-041 — carried so a reply started from a list can pre-fill these core fields (AC8).
    originatingFunction: item.OriginatingFunction || undefined,
    recordClassificationName: item.RecordClassification || undefined,
  };
}

/**
 * Write-side counterpart to mapCorrespondenceRowToStub — builds the CORMS_Correspondence field
 * bag for an insert/update (CorrespondenceServiceCore.create, Create Correspondence backend
 * task). `senderId`/`assignedToId` are numeric SharePoint user ids (already resolved by the
 * caller — this function stays free of any SPFI/user-lookup dependency, same "pure" convention
 * as the rest of this file).
 *
 * CMS-001 AC9 note: CorrespondenceType and ContentTypeName are two distinct schema columns fed by
 * two distinct UI fields, never collapsed. The Create Correspondence screen's own "Correspondence
 * Type" field (CoreMetadataSection.tsx field #1) is actually the Incoming/Outgoing selector —
 * there is no separate "type of correspondence" UI field beyond that selector and the RecordHub
 * "Content Type" field (field #3, e.g. Letter/Memo/Report). So CorrespondenceType is written from
 * `payload.direction` (mirroring Direction as free text, matching what the read-side mapper's
 * `stub.type` has always exposed) while ContentTypeName is written from `payload.contentType` —
 * two genuinely different values, from two genuinely different fields, persisted independently.
 *
 * ContentTypeName, not ContentType: see listSchemas.ts's field comment — "ContentType" collides
 * with SharePoint's own built-in per-item content-type navigation property and fails every write
 * with an OData "PrimitiveValue found, navigation property expected" error, found via manual
 * testing against a real tenant.
 */
export function buildCorrespondenceRowForWrite(
  payload: ICreateCorrespondencePayload,
  status: CorrespondenceStatus,
  senderId: number,
  assignedToId: number | undefined,
  referenceNumber: string | undefined,
  dateCreated: string,
  // CMS-022 — the chain this item belongs to (constant controlled number) and, for a reply, the
  // parent item id. Empty for a standalone item until threading is resolved at submit.
  threadId?: string,
  parentReplyToId?: string
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    ThreadId: threadId ?? '',
    ParentReplyToId: parentReplyToId ?? '',
    Title: payload.subject,
    Direction: payload.direction === 'Outgoing' ? 'Outgoing' : 'Incoming',
    CorrespondenceType: payload.direction,
    ContentTypeName: payload.contentType ?? '',
    Channel: payload.channel ?? '',
    Priority: payload.priority,
    OriginatingFunction: payload.originatingFunction ?? '',
    SecurityLevel: tierToSecurityLevel(payload.securityTier) ?? '',
    RecordClassification: payload.recordClassification ?? '',
    DestinationType: payload.destinationType,
    DestinationDepartments: JSON.stringify(payload.destinationDepartments ?? []),
    ExternalOrganizations: JSON.stringify(payload.externalOrganizations ?? []),
    SenderId: senderId,
    ExistingDocumentUrl: payload.existingDocumentUrl ?? '',
    ExistingDocumentName: payload.existingDocumentName ?? '',
    Recipient: payload.recipient ?? '',
    DateCreated: dateCreated,
    DueDate: payload.dueDate ?? null,
    DeliveryEmail: payload.deliveryEmail,
    DeliveryPhysicalMail: payload.deliveryPhysicalMail,
    // Physical-mail dispatch details as JSON (empty when none) — CMS-020. Only present when Physical
    // Mail is selected; the backend generates the follow-up dispatch task from it on send.
    PhysicalDispatch: payload.physicalDispatch ? JSON.stringify(payload.physicalDispatch) : '',
    CommentsNotes: payload.comments ?? '',
    Status: mapStatusToListValue(status),
    ReferenceNo: referenceNumber ?? '',
  };
  if (assignedToId !== undefined) row.AssignedToId = assignedToId;
  // CMS-037 AC4 — persist the approved template the body was authored from, plus the template
  // version in force at authoring time, for OUTGOING template-authored items only. This is optional
  // provenance; items authored without a template remain valid. Incoming items never carry a
  // template (CMS-001 AC3 rejects it), so they are left untouched here.
  if (payload.direction === 'Outgoing' && payload.templateReference) {
    row.TemplateReference = payload.templateReference;
    row.TemplateVersion = payload.templateVersion ?? 1;
  }
  if (payload.direction === 'Outgoing') row.MainDocumentSigned = payload.mainDocumentSigned === true;
  return row;
}

/** Extra columns (beyond the stub set) written by Create Correspondence, needed to reopen a draft
 * in edit mode. Read shape for mapCorrespondenceRowToDraftForm. */
export interface ICorrespondenceDraftRow extends ICorrespondenceListItem {
  ContentTypeName?: string;
  Channel?: string;
  OriginatingFunction?: string;
  RecordClassification?: string;
  DestinationType?: string;
  ExternalOrganizations?: string;
  DeliveryEmail?: boolean;
  DeliveryPhysicalMail?: boolean;
  PhysicalDispatch?: string;
  CommentsNotes?: string;
  ExistingDocumentUrl?: string;
  ExistingDocumentName?: string;
  MainDocumentSigned?: boolean;
}

/** $select for reading a single draft back for edit — every column
 * buildCorrespondenceRowForWrite persists. All are provisioned by this app's own schema, so this
 * never hits the "unknown field 400s the whole query" hazard the shared list select guards against. */
export const CORRESPONDENCE_DRAFT_EDIT_SELECT = [
  'Id',
  'Title',
  'Direction',
  'ContentTypeName',
  'Channel',
  'Priority',
  'OriginatingFunction',
  'SecurityLevel',
  'RecordClassification',
  'DestinationType',
  'DestinationDepartments',
  'ExternalOrganizations',
  'Sender/Title',
  'Sender/Id',
  'Recipient',
  'DateCreated',
  'DueDate',
  'DeliveryEmail',
  'DeliveryPhysicalMail',
  'PhysicalDispatch',
  'CommentsNotes',
  'ExistingDocumentUrl',
  'ExistingDocumentName',
  'MainDocumentSigned',
  'Status',
  'ThreadId',
  'ParentReplyToId',
];

export const CORRESPONDENCE_DRAFT_EDIT_EXPAND = ['Sender'];

/** Parses a Note column that Create Correspondence wrote as JSON.stringify(string[]) — tolerant of
 * a legacy plain "a; b" value or an empty/blank cell, always returning a clean string[]. */
export function parseNameList(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  const value = (raw ?? '').trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    /* not JSON — fall through to delimiter split */
  }
  return value
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Defensive display form for legacy multi-value metadata. It accepts real arrays, JSON text and
 * semicolon-delimited text and never leaks JSON punctuation into the Details/list UI. */
export function normalizeDisplayList(raw: string | string[] | undefined): string {
  return parseNameList(raw).join(', ');
}

/**
 * Reverse of buildCorrespondenceRowForWrite — rebuilds a draft's Create Correspondence fields from
 * its persisted row so the screen can reopen it for editing/submission (CMS draft-submit). Only the
 * values the row actually stores are recovered; recipients/departments/organizations return as the
 * display names the write side persisted (the form uses each name as both id and label). A blank
 * SecurityLevel stays undefined (no level chosen yet) rather than defaulting to tier 1.
 */
export function mapCorrespondenceRowToDraftForm(item: ICorrespondenceDraftRow): IDraftEditData {
  const securityLevel = (item.SecurityLevel ?? '').trim();
  return {
    existingId: String(item.Id),
    chainId: item.ThreadId || undefined,
    parentId: item.ParentReplyToId || undefined,
    subject: item.Title ?? '',
    direction: item.Direction === 'Outgoing' ? 'Outgoing' : 'Incoming',
    priority: item.Priority === 'High' ? 'High' : 'Normal',
    contentType: item.ContentTypeName || undefined,
    channel: item.Channel || undefined,
    originatingFunction: item.OriginatingFunction || undefined,
    securityTier: securityLevel ? securityLevelToTier(securityLevel) : undefined,
    recordClassification: item.RecordClassification || undefined,
    destinationType: item.DestinationType === 'External' ? 'External' : 'Internal',
    destinationDepartments: parseNameList(item.DestinationDepartments),
    externalOrganizations: parseNameList(item.ExternalOrganizations),
    sender: item.Sender?.Title || undefined,
    senderId: item.Sender?.Id !== undefined ? String(item.Sender.Id) : undefined,
    existingDocumentUrl: item.ExistingDocumentUrl || undefined,
    existingDocumentName: item.ExistingDocumentName || undefined,
    recipients: parseNameList(item.Recipient),
    dateCreated: (item.DateCreated ?? '').slice(0, 10),
    dueDate: item.DueDate ? item.DueDate.slice(0, 10) : undefined,
    deliveryEmail: item.DeliveryEmail !== false,
    deliveryPhysicalMail: item.DeliveryPhysicalMail === true,
    physicalDispatch: parsePhysicalDispatch(item.PhysicalDispatch),
    comments: item.CommentsNotes ?? '',
    mainDocumentSigned: item.MainDocumentSigned === true,
  };
}

export const CORRESPONDENCE_LIST_SELECT = [
  'Id',
  'Title',
  'ReferenceNo',
  'Direction',
  'CorrespondenceType',
  // ContentTypeName is distinct from CorrespondenceType (Incoming/Outgoing) and drives the
  // Triage Content Type picker as well as the routing-matrix match.
  'ContentTypeName',
  'Priority',
  'SecurityLevel',
  'DestinationDepartments',
  'Sender/Title',
  'Recipient',
  'AssignedTo/Title',
  'DateCreated',
  'DueDate',
  'Status',
  'ThreadId',
  'ParentReplyToId',
  // CMS-014 — pending-response flag + its awaited-party/timestamp detail (drives AC4 escalation).
  'PendingResponse',
  'PendingResponseParty',
  'PendingResponsePartyType',
  'PendingResponseFlaggedAt',
  'PendingResponseFlaggedBy',
  'ExpeditedFlag',
  'ExpeditedReason',
  'ExpeditedBy/Title',
  'ExpeditedAt',
  // CMS-041 — needed to pre-fill a reply's classification/originating-function from a list (AC8).
  'OriginatingFunction',
  'RecordClassification',
  // CMS-011 — routed next action + attribution (AC3/AC6).
  'NextAction',
  'RoutedBy',
  'RoutedAt',
];

export const CORRESPONDENCE_LIST_EXPAND = ['Sender', 'AssignedTo', 'ExpeditedBy'];

/** CurrentDepartment/CurrentReviewer (CMS-040 Part 0) are deliberately NOT in
 * CORRESPONDENCE_LIST_SELECT/EXPAND above, even though only the Details tab renders them —
 * those two arrays are shared by every list/detail/thread query in the app (List, Inbox/Sent,
 * Detail, Thread), and on a tenant where Provision Lists hasn't been re-run yet for this task,
 * SharePoint REST 400s the *entire* query for an unknown $select/$expand field — found via manual
 * testing against a real tenant that hadn't re-provisioned yet, which broke every correspondence
 * screen, not just Details. CorrespondenceDetailServiceCore fetches these two, if present, via
 * their own separately-error-handled call instead — see fetchCurrentDepartmentAndReviewer. */
export const CURRENT_DEPARTMENT_REVIEWER_SELECT = ['CurrentDepartment', 'CurrentReviewer/Title'];
export const CURRENT_DEPARTMENT_REVIEWER_EXPAND = ['CurrentReviewer'];

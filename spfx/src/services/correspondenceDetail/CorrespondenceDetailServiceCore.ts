import type { SPFI } from '@pnp/sp';
import { CorrespondenceStatus, ICorrespondenceStub } from '../../models/ICorrespondence';
import { IAnnotationItem } from '../../models/IGroupDocs';
import {
  IAttachment,
  IAttachmentsResult,
  IAuditEntry,
  ICorrespondenceDetail,
  IDeclarationResult,
  IPhysicalAttachmentStub,
  FollowUpType,
  IReminder,
  ISecurityPrincipal,
  ITimelineEvent,
  TimelineEventKind,
} from '../../models/ICorrespondenceDetail';
import { parsePhysicalDispatch } from '../../models/IPhysicalDispatch';
import { formatRecordSerial } from '../common/recordSerial';
import {
  CorrespondenceDetailResult,
  IAccessDeniedResult,
  IDetailFieldPatch,
  TabResult,
} from '../interfaces/ICorrespondenceDetailService';
import { parseStoredAnnotations, serializeAnnotations } from './annotationStore';
import { escapeODataLiteral } from '../common/odata';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { ClearanceCheckResult, checkCorrespondenceClearance, isWithinClearance } from '../common/clearance';
import { DelegationContextResolver } from '../delegation/DelegationContextResolver';
import { AttachmentServiceCore, IAttachmentContentSurface } from '../attachments/AttachmentServiceCore';
import { PhysicalAttachmentServiceCore } from '../physicalAttachments/PhysicalAttachmentServiceCore';
import { AttachmentStorageServiceCore, IStoredFile } from '../attachments/AttachmentStorageServiceCore';
import {
  attachmentFolderReadCandidates,
  buildAttachmentFolderPath,
} from '../attachments/attachmentFolderPath';
import { buildFilePlanInfo } from './filePlanInfo';
import { diffDetailPatch, formatDetailChanges, IDetailChange } from './detailChangeSummary';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import {
  CORRESPONDENCE_LIST_EXPAND,
  CORRESPONDENCE_LIST_SELECT,
  CURRENT_DEPARTMENT_REVIEWER_EXPAND,
  CURRENT_DEPARTMENT_REVIEWER_SELECT,
  ICorrespondenceListItem,
  mapCorrespondenceRowToStub,
  mapStatusToListValue,
} from '../common/mapCorrespondenceRow';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';

/** Repairs a legacy existing-document URL whose site segment was duplicated
 * (…/sites/X/sites/X/… → …/sites/X/…) — an earlier bug when attaching a document from another
 * site. A correctly-stored URL is returned unchanged. Applied on read so already-saved records
 * open instead of 404ing. */
export function collapseDuplicateSitePath(url: string): string {
  return url.replace(/(\/sites\/[^/]+)\1(\/|$)/i, '$1$2');
}
const TIMELINE_LIST_TITLE = 'CORMS_Timeline';

const ACCESS_DENIED: IAccessDeniedResult = { accessDenied: true };

interface IDetailListItem extends ICorrespondenceListItem {
  ContentTypeName?: string;
  OriginatingFunction?: string;
  CommentsNotes?: string;
  RecordClassification?: string;
  DeliveryEmail?: boolean;
  DeliveryPhysicalMail?: boolean;
  PhysicalDispatch?: string;
  DeclaredBy?: string;
  DeclaredAt?: string;
  RecordSerialNumber?: string;
  /** SharePoint's built-in Created By — the requestor who raised the correspondence. */
  AuthorId?: number;
}

interface ITimelineListItem {
  Id: number;
  EventType?: string;
  Actor?: { Title?: string };
  Description?: string;
  EventTimestamp?: string;
}

interface IRoleAssignmentRow {
  PrincipalId: number;
  Member?: { Title?: string; PrincipalType?: number };
  RoleDefinitionBindings?: { Name?: string }[];
}

const EVENT_TYPE_TO_KIND: Record<string, TimelineEventKind> = {
  Created: 'created',
  Edited: 'edited',
  Submitted: 'submitted',
  ReferenceAssigned: 'referenceAssigned',
  Routed: 'routed',
  Approved: 'approved',
  Rejected: 'rejected',
  SignatureRequested: 'signatureRequested',
  Signed: 'signed',
  EmailSent: 'emailSent',
  Delivered: 'delivered',
  Acknowledged: 'acknowledged',
  Expedited: 'expedited',
  Reassigned: 'reassigned',
  // CMS-042 — follow-up reminder scheduled, and reminder fired on its due date. Both render as the
  // same 'reminder' timeline kind.
  ReminderSet: 'reminder',
  ReminderFired: 'reminder',
  // CORMS_Timeline's 'Escalated' choice has no TimelineEventKind equivalent yet.
  // TODO(confirm): mapped to the closest neutral fallback ('edited') rather than fabricating a
  // new kind the UI doesn't render specially for.
  Escalated: 'edited',
};

function mapEventTypeToKind(raw: string | undefined): TimelineEventKind {
  return (raw && EVENT_TYPE_TO_KIND[raw]) || 'edited';
}

const FOLLOW_UP_TYPES: FollowUpType[] = [
  '1st Follow-up',
  '2nd Follow-up Letter',
  '3rd Follow-up Letter (Final)',
  'Escalation Notice',
];

/** Reads the stored ReminderType string back to a known FollowUpType, defaulting to the first
 * follow-up when the persisted value is blank/unrecognized (CMS-042). */
function toFollowUpType(raw: string | undefined): FollowUpType {
  return FOLLOW_UP_TYPES.find((t) => t === raw) ?? '1st Follow-up';
}

/** SharePoint's PrincipalType: 1 = User, 4 = SecurityGroup, 8 = SharePointGroup — anything other
 * than a plain User (the common case for CORMS's inherited permissions) is rendered as a
 * "SharePoint Group" for the Security tab's Type column, matching ISecurityPrincipal's 2-value
 * union. */
function mapRoleAssignment(row: IRoleAssignmentRow): ISecurityPrincipal {
  const bindings = (row.RoleDefinitionBindings ?? []).map((b) => b.Name).filter((n): n is string => !!n);
  return {
    id: String(row.PrincipalId),
    principal: row.Member?.Title ?? '',
    permissionLevel: bindings.join(', ') || '—',
    type: row.Member?.PrincipalType === 1 ? 'User' : 'SharePoint Group',
  };
}

/**
 * Pure CORMS_Correspondence detail-read logic — see provisioningCore.ts's file comment for why
 * Core classes only `import type { SPFI }`. CorrespondenceDetailService.live.ts is the thin real
 * wrapper.
 *
 * CMS-040 Part 1 — every public method below (getDetail, getAttachments, getSecurityAssignments,
 * getAuditTrail, getTimeline, getThread, getReminder) independently calls the shared
 * checkCorrespondenceClearance guard and writes its own "Viewed {Tab}" audit event as part
 * of the same call, closing the AC9 gap the earlier EPIC 14 task left open: a caller that invokes
 * one tab's own fetch method directly (skipping getDetail entirely) is blocked and audited exactly
 * the same way as the initial open. getDetail() itself only carries header/Details-tab fields now —
 * Attachments/Security/Audit/Timeline/Thread/Reminder each moved to their own method, so nothing
 * eagerly fetches (or leaks) another tab's data.
 */
export class CorrespondenceDetailServiceCore {
  private readonly delegationContextResolver: DelegationContextResolver;
  private readonly attachmentService: AttachmentServiceCore;
  private readonly physicalAttachmentService: PhysicalAttachmentServiceCore;

  constructor(
    private readonly sp: SPFI,
    private readonly getCurrentUserClearanceTier: () => Promise<number>,
    private readonly auditTrailService: IAuditTrailService,
    delegationContextResolver?: DelegationContextResolver,
    /** Optional — resolves each attachment's real serverRelativeUrl (CMS-040 Part 2). When absent
     * (e.g. a unit test that doesn't care about URLs), getAttachments still returns correct
     * metadata with `url` left undefined rather than failing. */
    private readonly attachmentStorage?: AttachmentStorageServiceCore,
    /** Needed only to save a signed main document as a new attachment (saveSignedMainDocument). */
    attachmentContentSurface?: IAttachmentContentSurface
  ) {
    this.delegationContextResolver = delegationContextResolver ?? new DelegationContextResolver(sp);
    this.attachmentService = new AttachmentServiceCore(sp, attachmentContentSurface);
    this.physicalAttachmentService = new PhysicalAttachmentServiceCore(sp);
  }

  /** The gate every public method opens with (CMS-040 AC9). Only getDetail needs 'notfound' told
   * apart from 'denied'; every per-tab method treats both the same, so it uses canRead below. */
  private async checkClearance(idNum: number): Promise<ClearanceCheckResult> {
    const clearanceTier = await this.getCurrentUserClearanceTier();
    return checkCorrespondenceClearance(this.sp, CORRESPONDENCE_LIST_TITLE, idNum, clearanceTier);
  }

  /** A non-numeric id can't name a SharePoint list item at all, so it's refused the same way an
   * insufficient clearance is — a caller learns nothing either way. */
  private async canRead(id: string): Promise<boolean> {
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) return false;
    return (await this.checkClearance(idNum)) === 'ok';
  }

  public async getDetail(id: string): Promise<CorrespondenceDetailResult> {
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) return undefined;

    const check = await this.checkClearance(idNum);
    if (check === 'notfound') return undefined;
    if (check === 'denied') return ACCESS_DENIED;

    const [row, currentDepartmentAndReviewer, channelRow, templateAuthorship, signedRow, currentUserId] =
      await Promise.all([
        this.fetchFullRow(idNum),
        this.fetchCurrentDepartmentAndReviewer(idNum),
        this.fetchChannel(idNum),
        this.fetchTemplateAuthorship(idNum),
        this.fetchMainDocumentSigned(idNum),
        // A failed identity lookup only withholds approver management; it must not fail the detail.
        getCurrentSiteUserId(this.sp).catch(() => undefined),
      ]);
    const stub = mapCorrespondenceRowToStub({ ...row, ...currentDepartmentAndReviewer });
    const detail: ICorrespondenceDetail = {
      ...stub,
      contentType: row.ContentTypeName || undefined,
      channel: channelRow.Channel || undefined,
      originatingFunction: row.OriginatingFunction,
      comment: row.CommentsNotes,
      recordClassificationName: row.RecordClassification,
      // CMS-027 AC3 — the enclosing business-activity File + its file-plan position, derived from
      // the Record Classification the item is filed under (undefined when unclassified).
      filePlan: buildFilePlanInfo(row.RecordClassification),
      deliveryEmail: row.DeliveryEmail,
      deliveryPhysicalMail: row.DeliveryPhysicalMail,
      physicalDispatch: parsePhysicalDispatch(row.PhysicalDispatch),
      // CMS-008 — declaration attribution/serial, present once the record has been declared.
      declaredBy: row.DeclaredBy || undefined,
      declaredAt: row.DeclaredAt || undefined,
      recordSerialNumber: row.RecordSerialNumber || undefined,
      // Template provenance is retained when a template was used; it is informative only and does
      // not restrict declaration or delivery.
      templateReference: templateAuthorship.templateReference,
      templateVersion: templateAuthorship.templateVersion,
      mainDocumentSigned: signedRow.MainDocumentSigned === true,
      viewerIsRequestor: currentUserId !== undefined && row.AuthorId === currentUserId,
    };

    await this.logView(id, 'Viewed Details', `Opened correspondence: ${detail.subject}`).catch(
      () => undefined
    );
    return detail;
  }

  public async getAttachments(id: string): Promise<TabResult<IAttachmentsResult>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const [records, physical, folderCtx, linkedDocument] = await Promise.all([
      this.attachmentService.list(id),
      this.physicalAttachmentService.getByCorrespondence(id),
      this.fetchAttachmentFolderContext(Number(id)),
      this.fetchLinkedDocument(Number(id)),
    ]);
    // AC11 — files may live under Year/Month/Serial (numbered) and/or the bare id (draft-era/legacy);
    // list every candidate folder and merge, first (newest-scheme) occurrence of a name winning.
    const files = await this.listAttachmentFiles(id, folderCtx);
    // File-system casing and attachment metadata casing don't always match (for example after a
    // migration), so resolve URLs case-insensitively. This keeps a valid supporting document from
    // rendering as a disabled row just because its filename's case changed.
    const urlByFileName = new Map(files.map((f) => [f.fileName.toLowerCase(), f.serverRelativeUrl]));

    const uploaded: IAttachment[] = records.map((r) => ({
      id: r.id,
      name: r.fileName,
      source: r.source,
      isMain: r.isMainLetter,
      securityTier: r.securityTier,
      url: urlByFileName.get(r.fileName.toLowerCase()),
    }));
    // Support documents occasionally arrive in the correspondence folder before a corresponding
    // CORMS_Attachments metadata row is written (older imports and interrupted saves both produce
    // that shape). The Files tab is a document inventory, so include those real files too instead
    // of silently showing only the main document. Metadata-backed rows win when both exist.
    const metadataNames = new Set(records.map((record) => record.fileName.toLowerCase()));
    files.forEach((file) => {
      if (metadataNames.has(file.fileName.toLowerCase())) return;
      uploaded.push({
        id: `stored-file:${file.serverRelativeUrl}`,
        name: file.fileName,
        source: 'Uploaded',
        isMain: false,
        url: file.serverRelativeUrl,
      });
    });
    // A Records Hub link is a first-class main document, but is deliberately not an attachment
    // record/file in CORMS. Prefer an uploaded main document when legacy data has both.
    if (linkedDocument && !uploaded.some((attachment) => attachment.isMain)) {
      uploaded.unshift({
        id: `existing-document-${id}`,
        name: linkedDocument.name,
        source: 'Records Hub link',
        isMain: true,
        url: linkedDocument.url,
      });
    }
    const physicalStubs: IPhysicalAttachmentStub[] = physical.map((p) => ({
      id: p.id,
      resourceIdentifier: p.resourceIdentifier,
      storageLocation: p.storageLocation,
      description: p.description,
    }));

    await this.logView(
      id,
      'Viewed Attachments',
      `Viewed ${uploaded.length} attachment(s) for correspondence ${id}`
    ).catch(() => undefined);
    return { uploaded, physical: physicalStubs };
  }

  private async fetchLinkedDocument(id: number): Promise<{ name: string; url: string } | undefined> {
    try {
      const row = (await this.sp.web.lists
        .getByTitle(CORRESPONDENCE_LIST_TITLE)
        .items.getById(id)
        .select('ExistingDocumentUrl', 'ExistingDocumentName')()) as {
        ExistingDocumentUrl?: string;
        ExistingDocumentName?: string;
      };
      const url = collapseDuplicateSitePath((row.ExistingDocumentUrl ?? '').trim());
      if (!/^https?:\/\//i.test(url)) return undefined;
      return { url, name: (row.ExistingDocumentName ?? '').trim() || url.slice(url.lastIndexOf('/') + 1) };
    } catch {
      // The additive columns may not yet exist on a tenant; ordinary attachment reads remain safe.
      return undefined;
    }
  }

  /** Real SharePoint list-item role assignments (CMS-040 Part 3) — the first use of this REST API
   * in the project. NOTE: this reflects real SharePoint role assignments (typically inherited from
   * the CORMS_Correspondence list), not a CORMS-specific security model — CORMS doesn't break
   * inheritance per-item anywhere in the current design, so most items will show only inherited
   * principals. If per-item unique permissions become a requirement later, that's a distinct,
   * larger design decision (item-level permission breaking has real performance implications at
   * scale) and is out of scope here. */
  public async getSecurityAssignments(id: string): Promise<TabResult<ISecurityPrincipal[]>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const rows = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(Number(id))
      .roleAssignments.expand('Member', 'RoleDefinitionBindings')()) as IRoleAssignmentRow[];

    await this.logView(id, 'Viewed Security', `Viewed security assignments for correspondence ${id}`).catch(
      () => undefined
    );
    return rows.map(mapRoleAssignment);
  }

  public async getAuditTrail(id: string): Promise<TabResult<IAuditEntry[]>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const entries = (await this.auditTrailService.getEntries({ objectId: id })).map((entry) => ({
      id: entry.id,
      seq: entry.seq,
      action: entry.action,
      actor: entry.actor,
      details: entry.details,
      timestamp: entry.timestamp,
    }));
    await this.logView(id, 'Viewed Audit', `Viewed audit trail for correspondence ${id}`).catch(
      () => undefined
    );
    return entries;
  }

  public async getTimeline(id: string): Promise<TabResult<ITimelineEvent[]>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const events = await this.fetchTimeline(id);
    await this.logView(id, 'Viewed Timeline', `Viewed timeline for correspondence ${id}`).catch(
      () => undefined
    );
    return events;
  }

  /** Clearance is checked against the *opened* item `id` first — closing the gap where a low-tier
   * chain item would otherwise leak through even for a caller who can't see the opened item at
   * all — then each returned item is additionally filtered by its own tier as defense-in-depth
   * (a chain can legitimately mix security tiers across its items). */
  public async getThread(id: string, chainId: string): Promise<TabResult<ICorrespondenceStub[]>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;
    if (!chainId) return [];

    // CMS-022 — the chain is its one controlled number (AC4). Match items whose ThreadId is that
    // number OR whose ReferenceNo is that number, so a chain holds together even when an older
    // parent's ThreadId wasn't backfilled (its ReferenceNo still equals the chain number).
    const literal = escapeODataLiteral(chainId);
    const items = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.filter(`(ThreadId eq '${literal}' or ReferenceNo eq '${literal}')`)
      .select(...CORRESPONDENCE_LIST_SELECT)
      .expand(...CORRESPONDENCE_LIST_EXPAND)
      .orderBy('DateCreated', true)()) as ICorrespondenceListItem[];

    const clearanceTier = await this.getCurrentUserClearanceTier();
    const thread = items
      .map(mapCorrespondenceRowToStub)
      .filter((s) => isWithinClearance(s.securityTier, clearanceTier));
    await this.logView(id, 'Viewed Thread', `Viewed thread for correspondence ${id}`).catch(() => undefined);
    return thread;
  }

  /** CMS-042 — the single active follow-up reminder held on the sent item (AC4). Reminder columns
   * are additive (see listSchemas.ts); a tenant that hasn't re-run Provision Lists 400s the
   * $select, so this reads them best-effort and degrades to "no reminder" rather than failing. */
  public async getReminder(id: string): Promise<TabResult<IReminder | undefined>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const idNum = Number(id);
    const row = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select('ReminderDate', 'ReminderType', 'ReminderNote')()
      .catch(() => ({}))) as { ReminderDate?: string; ReminderType?: string; ReminderNote?: string };

    await this.logView(id, 'Viewed Reminder', `Viewed reminder for correspondence ${id}`).catch(
      () => undefined
    );
    if (!row.ReminderDate) return undefined;
    return {
      // Stored as a SharePoint DateTime (ISO); the compose UI's date input wants YYYY-MM-DD.
      date: row.ReminderDate.slice(0, 10),
      followUpType: toFollowUpType(row.ReminderType),
      note: row.ReminderNote ?? '',
    };
  }

  /** CMS-042 — schedules or replaces the follow-up reminder on a sent item. A reminder date is
   * mandatory (AC5); persists the reminder on the item and records a 'ReminderSet' timeline event
   * (AC7). The due-date email (AC6) is raised by the Power Automate flow triggering off ReminderDate. */
  public async saveReminder(id: string, reminder: IReminder): Promise<TabResult<void>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;
    if (!reminder.date) return undefined;

    const idNum = Number(id);
    await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .update({
        ReminderDate: reminder.date,
        ReminderType: reminder.followUpType,
        ReminderNote: reminder.note ?? '',
      });

    await this.addTimelineEvent(
      id,
      'ReminderSet',
      `${reminder.followUpType} scheduled for ${reminder.date}${reminder.note ? ` — ${reminder.note}` : ''}`
    ).catch(() => undefined);
    await this.logView(id, 'Reminder Scheduled', `${reminder.followUpType} — due ${reminder.date}`).catch(
      () => undefined
    );
    return undefined;
  }

  /** CMS-042 — clears the reminder on a sent item (AC4) by blanking its reminder columns. */
  public async clearReminder(id: string): Promise<TabResult<void>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const idNum = Number(id);
    await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .update({ ReminderDate: null, ReminderType: null, ReminderNote: null });

    await this.logView(id, 'Reminder Cleared', `Reminder cleared for correspondence ${id}`).catch(
      () => undefined
    );
    return undefined;
  }

  // CMS-008 — manually declare the draft as a final, immutable record. Stamps Status 'Declared',
  // the declaring user + timestamp (AC3), and a record serial number for filing/retrieval (AC7),
  // then writes a dedicated 'Record Declared' audit row (AC5/AC9) and a Timeline event. The
  // Declare permission (AC1) and the approval-complete gate are enforced by the caller.
  //
  public async declareRecord(id: string, declaredBy: string): Promise<TabResult<IDeclarationResult>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const idNum = Number(id);
    const declaredAt = new Date().toISOString();
    // The item id is a stable, unique, monotonic sequence — a natural basis for the record serial.
    const recordSerialNumber = formatRecordSerial(new Date().getFullYear(), idNum);
    const row = await this.fetchFullRow(idNum);
    const recordClassification = row.RecordClassification;

    await this.sp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(idNum).update({
      Status: 'Declared',
      DeclaredBy: declaredBy,
      DeclaredAt: declaredAt,
      RecordSerialNumber: recordSerialNumber,
    });

    await this.addTimelineEvent(id, 'Declared', `Declared as record ${recordSerialNumber}`).catch(
      () => undefined
    );
    // AC5/AC9 — audited separately from signing, under its own action.
    await this.logView(
      id,
      'Record Declared',
      `Declared as final record · Serial ${recordSerialNumber}`
    ).catch(() => undefined);

    return { declaredBy, declaredAt, recordSerialNumber, recordClassification };
  }

  /** CMS-024 — reads the persisted annotation set for the item's document. RecordsHub/GroupDocs does
   * not store annotations, so CORMS_Correspondence.AnnotationsJson is the source of truth, redrawn
   * over the plain preview. AnnotationsJson is additive (see listSchemas.ts); a tenant that hasn't
   * re-run Provision Lists 400s the $select, so this reads it best-effort and degrades to "no
   * annotations" rather than failing. */
  public async getAnnotations(id: string): Promise<TabResult<IAnnotationItem[]>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const idNum = Number(id);
    const row = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select('AnnotationsJson')()
      .catch(() => ({}))) as { AnnotationsJson?: string };

    await this.logView(id, 'Viewed Annotations', `Viewed annotations for correspondence ${id}`).catch(
      () => undefined
    );
    return parseStoredAnnotations(row.AnnotationsJson);
  }

  /** CMS-024 — persists the full annotation set on the item (replaces the whole set, matching the
   * GroupDocs /add semantics the Annotate tab already resends against). Clearance-gated and audited. */
  public async saveAnnotations(id: string, annotations: IAnnotationItem[]): Promise<TabResult<void>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const idNum = Number(id);
    await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .update({ AnnotationsJson: serializeAnnotations(annotations) });

    await this.logView(
      id,
      'Annotations Saved',
      `Saved ${annotations.length} annotation(s) for correspondence ${id}`
    ).catch(() => undefined);
    return undefined;
  }

  // CMS-040 — persist inline edits to the Details tab's editable fields (Assigned To, Comments),
  // with the mandatory change comment written to the audit trail. Only the supplied fields are
  // touched. Assigned To is a Person field, so the entered value is resolved to a site user via
  // ensureUser; an unresolvable value is skipped so the Comments edit still saves.
  public async updateDetails(
    id: string,
    patch: IDetailFieldPatch,
    changeComment: string
  ): Promise<TabResult<void>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;

    const idNum = Number(id);
    const item = this.sp.web.lists.getByTitle(CORRESPONDENCE_LIST_TITLE).items.getById(idNum);

    // Read the current values first so the audit row can record the exact before→after for each
    // field. AssignedTo/Title is already part of the list's default select/expand; the other three
    // are plain columns. A read failure shouldn't block the edit, so fall back to an empty snapshot.
    let before: {
      originatingFunction?: string;
      dueDate?: string;
      comment?: string;
      assignedToName?: string;
    } = {};
    try {
      const current = (await item
        .select('OriginatingFunction', 'DueDate', 'CommentsNotes', 'AssignedTo/Title')
        .expand('AssignedTo')()) as {
        OriginatingFunction?: string;
        DueDate?: string;
        CommentsNotes?: string;
        AssignedTo?: { Title?: string };
      };
      before = {
        originatingFunction: current.OriginatingFunction,
        dueDate: current.DueDate,
        comment: current.CommentsNotes,
        assignedToName: current.AssignedTo?.Title,
      };
    } catch {
      // Leave `before` empty — the diff still records the new values as the "after".
    }

    // Only the fields that genuinely differ are applied and audited (diffDetailPatch drops no-op
    // re-selections). Assigned To is resolved through ensureUser here; if that fails the change is
    // dropped from both the write and the audit so the row reflects only what actually persisted.
    const candidateChanges = diffDetailPatch(before, patch);
    const update: Record<string, unknown> = {};
    const applied: IDetailChange[] = [];

    for (const change of candidateChanges) {
      if (change.field === 'originatingFunction') {
        update.OriginatingFunction = patch.originatingFunction ?? '';
        applied.push(change);
      } else if (change.field === 'dueDate') {
        update.DueDate = patch.dueDate ? patch.dueDate : null;
        applied.push(change);
      } else if (change.field === 'comment') {
        update.CommentsNotes = patch.comment ?? '';
        applied.push(change);
      } else if (change.field === 'assignedTo' && patch.assignedTo) {
        try {
          const ensured = (await this.sp.web.ensureUser(patch.assignedTo.login)) as {
            Id?: number;
            data?: { Id?: number };
          };
          const userId = ensured.Id ?? ensured.data?.Id;
          if (userId !== undefined) {
            update.AssignedToId = userId;
            applied.push(change);
          }
        } catch {
          // The picked value didn't resolve to a SharePoint user — leave Assigned To unchanged and
          // still persist the other edits.
        }
      }
    }

    if (Object.keys(update).length > 0) {
      await item.update(update);
    }

    const summary = formatDetailChanges(applied);
    await this.logView(id, 'Details Edited', `${summary || 'No fields changed'} — ${changeComment}`).catch(
      () => undefined
    );
    return undefined;
  }

  /** CMS-006 — persist the correspondence Status column so an approval outcome (e.g. 'Approved') is
   * durable and visible to every user, not just the acting approver's session. Clearance-gated. */
  public async setStatus(id: string, status: CorrespondenceStatus): Promise<TabResult<void>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;
    // The list's Choice values differ from the model's tokens ('In Review' vs 'InReview'); writing
    // the raw token stores a value mapStatus can't read back and every list query misses.
    const listStatus = mapStatusToListValue(status);
    await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(Number(id))
      .update({ Status: listStatus });
    await this.logView(id, 'Status Changed', `Status set to ${listStatus}`).catch(() => undefined);
    return undefined;
  }

  /**
   * Every signer signs the same document: each signed PDF becomes the main document, so the next
   * signer's request carries all signatures so far. A main PDF is replaced in place (SharePoint
   * keeps each signed version); a Word or linked Records Hub main document is kept as it is and the
   * PDF is added beside it as the new main document. Resolves with the main document's file name.
   */
  public async saveSignedMainDocument(id: string, signedPdf: Blob): Promise<TabResult<string>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;
    const storage = this.attachmentStorage;
    if (!storage) throw new Error('Saving a signed document needs attachment storage.');
    const [records, folderCtx, linkedDocument] = await Promise.all([
      this.attachmentService.list(id),
      this.fetchAttachmentFolderContext(Number(id)),
      this.fetchLinkedDocument(Number(id)),
    ]);
    const files = await this.listAttachmentFiles(id, folderCtx);
    const main = records.find((record) => record.isMainLetter);
    const mainFile =
      main && files.find((file) => file.fileName.toLowerCase() === main.fileName.toLowerCase());

    let fileName: string;
    if (main && mainFile && /\.pdf$/i.test(main.fileName)) {
      await storage.replaceFile(mainFile.serverRelativeUrl, signedPdf);
      fileName = main.fileName;
    } else {
      const baseName = (main?.fileName ?? linkedDocument?.name ?? 'Signed document').replace(/\.[^.]+$/, '');
      fileName = uniqueFileName(
        `${baseName}.pdf`,
        files.map((file) => file.fileName)
      );
      const stored = await storage.uploadFile(
        buildAttachmentFolderPath({ correspondenceId: id, ...folderCtx }),
        fileName,
        signedPdf
      );
      const created = await this.attachmentService.create({
        correspondenceId: id,
        fileName,
        source: 'Uploaded',
        serverRelativeUrl: stored.serverRelativeUrl,
        securityTier: main?.securityTier,
      });
      await this.attachmentService.setMainLetter(id, created.id);
    }
    await this.logView(
      id,
      'Signed Document Saved',
      `Signed version saved as the main document: ${fileName}`
    ).catch(() => undefined);
    return fileName;
  }

  /** CMS-040 Part 6 — public wrapper to append a CORMS_Timeline event (e.g. an approval decision),
   * clearance-gated, so the item's Timeline records who did what for every viewer. */
  public async addTimelineEntry(
    id: string,
    eventType: string,
    description: string
  ): Promise<TabResult<void>> {
    if (!(await this.canRead(id))) return ACCESS_DENIED;
    await this.addTimelineEvent(id, eventType, description);
    return undefined;
  }

  /** Writes a CORMS_Timeline row for a lifecycle event the app raises itself (CMS-042's reminder
   * scheduling). Actor is the acting user; timestamp is now. */
  private async addTimelineEvent(
    correspondenceId: string,
    eventType: string,
    description: string
  ): Promise<void> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    await this.sp.web.lists.getByTitle(TIMELINE_LIST_TITLE).items.add({
      CorrespondenceId: correspondenceId,
      EventType: eventType,
      ActorId: currentUserId,
      Description: description,
      EventTimestamp: new Date().toISOString(),
    });
  }

  /** Writes a detail-view event (open, or a tab's own data fetch) through the shared audit store.
   * Audit logging is a genuine round-trip, not local-state-only. Never rejects the caller for a
   * logging failure; callers that don't want to block on it can swallow the rejection themselves.
   *
   * Delegation & Reassignment Backend task (CMS-017 AC8): if the acting user is currently standing
   * in for someone else via an Active delegation, the written row's Details gets an
   * "(on behalf of {delegatorId})" suffix appended — `details` here is always a plain
   * human-readable string, never JSON, so a plain-text suffix is the correct merge, not a
   * JSON.parse/stringify round trip.
   * TODO: wire DelegationContextResolver into additional action types as they're built in future
   * tasks — this task covers the resolver plus the currently-existing auditable actions. */
  public async logView(correspondenceId: string, action: string, details: string): Promise<void> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    // Swallowed deliberately: CORMS_Delegations is a different list with its own provisioning state
    // and permissions, and "is this user standing in for someone" is an *enrichment* of the audit
    // row. Letting it reject here would make an unprovisioned or unreadable delegation list stop
    // audit entries being written at all, which is strictly worse than writing one without the
    // "on behalf of" suffix.
    const activeDelegation = await this.delegationContextResolver
      .getActiveDelegationFor(String(currentUserId))
      .catch(() => undefined);
    const finalDetails = activeDelegation
      ? `${details} (on behalf of ${activeDelegation.delegatorId})`
      : details;
    await this.auditTrailService.logEvent({
      objectId: correspondenceId,
      actor: String(currentUserId),
      action,
      details: finalDetails,
      timestamp: new Date().toISOString(),
    });
  }

  /** Reads optional persisted template provenance (TemplateReference + TemplateVersion) best-effort.
   * These additive columns may be absent on an older tenant; their absence never affects delivery. */
  private async fetchTemplateAuthorship(
    idNum: number
  ): Promise<{ provisioned: boolean; templateReference?: string; templateVersion?: number }> {
    const row = (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select('Id', 'TemplateReference', 'TemplateVersion')()
      .catch(() => undefined)) as { TemplateReference?: string; TemplateVersion?: number } | undefined;
    if (!row) return { provisioned: false };
    return {
      provisioned: true,
      templateReference: (row.TemplateReference ?? '').trim() || undefined,
      templateVersion: row.TemplateVersion,
    };
  }

  private async fetchFullRow(idNum: number): Promise<IDetailListItem> {
    return (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select(
        ...CORRESPONDENCE_LIST_SELECT,
        // ContentTypeName has existed since the core Create Correspondence schema (CMS-001), so it's
        // safe in this guaranteed-present select — unlike Channel, which is new in this task and is
        // fetched best-effort below so a not-yet-provisioned tenant doesn't 400 the whole Details tab.
        'ContentTypeName',
        'OriginatingFunction',
        'CommentsNotes',
        'RecordClassification',
        'DeliveryEmail',
        'DeliveryPhysicalMail',
        'PhysicalDispatch',
        'DeclaredBy',
        'DeclaredAt',
        'RecordSerialNumber',
        'AuthorId'
      )
      .expand(...CORRESPONDENCE_LIST_EXPAND)()) as IDetailListItem;
  }

  /** Channel is new in this task, so on a tenant that hasn't re-run Provision Lists the column
   * doesn't exist yet and a $select naming it would 400 the whole Details query. Fetched as its own
   * best-effort call (catch → {}) — exactly like fetchCurrentDepartmentAndReviewer — so a
   * not-yet-provisioned tenant just shows Channel as '—' instead of breaking the tab. */
  private async fetchChannel(idNum: number): Promise<{ Channel?: string }> {
    return (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select('Channel')()
      .catch(() => ({}))) as { Channel?: string };
  }

  /** MainDocumentSigned is additive, so it is read on its own and absent reads as not signed. */
  private async fetchMainDocumentSigned(idNum: number): Promise<{ MainDocumentSigned?: boolean }> {
    return (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select('MainDocumentSigned')()
      .catch(() => ({}))) as { MainDocumentSigned?: boolean };
  }

  /** AC11 — DateCreated + ReferenceNo (both core, always-provisioned columns) drive the
   * Year/Month/Serial folder a file lives under. Best-effort: any read failure degrades to the bare
   * id candidate, so the Files tab still lists whatever sits under `{id}`. */
  private async fetchAttachmentFolderContext(
    idNum: number
  ): Promise<{ dateCreated?: string; referenceNumber?: string }> {
    try {
      const row = (await this.sp.web.lists
        .getByTitle(CORRESPONDENCE_LIST_TITLE)
        .items.getById(idNum)
        .select('DateCreated', 'ReferenceNo')()) as { DateCreated?: string; ReferenceNo?: string };
      return { dateCreated: row?.DateCreated, referenceNumber: row?.ReferenceNo };
    } catch {
      return {};
    }
  }

  /** Lists files across every candidate folder for a correspondence (Year/Month/Serial + bare id)
   * and merges them, keeping the first occurrence of each file name (newest scheme first). */
  private async listAttachmentFiles(
    id: string,
    folderCtx: { dateCreated?: string; referenceNumber?: string }
  ): Promise<IStoredFile[]> {
    const storage = this.attachmentStorage;
    if (!storage) return [];
    const candidates = attachmentFolderReadCandidates({
      correspondenceId: id,
      dateCreated: folderCtx.dateCreated,
      referenceNumber: folderCtx.referenceNumber,
    });
    const lists = await Promise.all(candidates.map((folder) => storage.listFiles(folder).catch(() => [])));
    const seen = new Set<string>();
    const merged: IStoredFile[] = [];
    lists.forEach((list) =>
      list.forEach((file) => {
        if (!seen.has(file.fileName)) {
          seen.add(file.fileName);
          merged.push(file);
        }
      })
    );
    return merged;
  }

  /** CurrentDepartment/CurrentReviewer (CMS-040 Part 0) are additive fields owned by other,
   * not-yet-backended epics — on a tenant where Provision Lists hasn't been re-run yet for this
   * task, the column genuinely doesn't exist and SharePoint REST 400s a $select/$expand naming it.
   * Fetched here as its own best-effort call, separate from fetchFullRow's guaranteed-present
   * fields, so a not-yet-provisioned tenant still gets a working Details tab — just with these two
   * fields rendering '—', exactly the "gracefully empty" behavior already intended for when the
   * columns exist but are merely unpopulated. See mapCorrespondenceRow.ts's comment on why these
   * aren't in the shared CORRESPONDENCE_LIST_SELECT/EXPAND every other query uses. */
  private async fetchCurrentDepartmentAndReviewer(
    idNum: number
  ): Promise<{ CurrentDepartment?: string; CurrentReviewer?: { Title?: string } }> {
    return (await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST_TITLE)
      .items.getById(idNum)
      .select(...CURRENT_DEPARTMENT_REVIEWER_SELECT)
      .expand(...CURRENT_DEPARTMENT_REVIEWER_EXPAND)()
      .catch(() => ({}))) as { CurrentDepartment?: string; CurrentReviewer?: { Title?: string } };
  }

  private async fetchTimeline(correspondenceId: string): Promise<ITimelineEvent[]> {
    const items = (await this.sp.web.lists
      .getByTitle(TIMELINE_LIST_TITLE)
      .items.filter(`CorrespondenceId eq '${escapeODataLiteral(correspondenceId)}'`)
      .select('Id', 'EventType', 'Actor/Title', 'Description', 'EventTimestamp')
      .expand('Actor')
      .orderBy('EventTimestamp', true)()) as ITimelineListItem[];

    return items.map((item) => ({
      id: String(item.Id),
      kind: mapEventTypeToKind(item.EventType),
      actor: item.Actor?.Title ?? '',
      details: item.Description ?? '',
      timestamp: item.EventTimestamp ?? '',
    }));
  }
}

/** `name` unless the folder already has it, then `name (signed).pdf`, `name (signed 2).pdf`, … */
function uniqueFileName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((file) => file.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const base = name.replace(/\.pdf$/i, '');
  for (let n = 1; ; n++) {
    const candidate = `${base} (signed${n > 1 ? ` ${n}` : ''}).pdf`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

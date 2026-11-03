import { CorrespondenceStatus, ICorrespondenceStub } from '../../models/ICorrespondence';
import { IAnnotationItem } from '../../models/IGroupDocs';
import {
  IAttachmentsResult,
  IAuditEntry,
  ICorrespondenceDetail,
  IDeclarationResult,
  IReminder,
  ISecurityPrincipal,
  ITimelineEvent,
} from '../../models/ICorrespondenceDetail';

/** Returned by every per-tab fetch method in place of that tab's data when the current user's
 * clearance is below the item's SecurityLevel (CMS-040 AC9). Deliberately carries no other field —
 * the whole point of enforcing this in the service is that no metadata leaks to a caller that
 * isn't entitled to see it, not just that the UI chooses not to render it. One shared shape across
 * every method means the UI renders one consistent access-denied state no matter which tab's fetch
 * is the one that happened to run first — a caller that deep-links straight into a single tab's
 * own fetch method (skipping getDetail entirely) is blocked exactly the same way. */
export interface IAccessDeniedResult {
  accessDenied: true;
}

export type TabResult<T> = T | IAccessDeniedResult;

/** A person chosen from the Details-tab people picker: `login` (claims/login or email) is what
 * ensureUser resolves to a SharePoint user id; `name` is the display name, carried so the audit
 * summary can show a readable "before → after" without a second lookup. */
export interface IPersonPatchValue {
  login: string;
  name: string;
}

/** The Details-tab fields a requestor may edit inline (CMS-040), each with the same input type as
 * the Create screen — Originating Function (dropdown), Due Date (date), Assigned To (people
 * picker), Comments (text). All optional: only the fields the user actually changed are sent. */
export interface IDetailFieldPatch {
  /** OriginatingFunction — the English function name (the picker's option id). */
  originatingFunction?: string;
  /** DueDate — a `yyyy-mm-dd` date string; an empty string clears it. */
  dueDate?: string;
  /** AssignedTo person column, resolved via ensureUser. */
  assignedTo?: IPersonPatchValue;
  /** CommentsNotes free text. */
  comment?: string;
}

export type CorrespondenceDetailResult = TabResult<ICorrespondenceDetail> | undefined;

export function isAccessDenied<T>(result: TabResult<T> | undefined): result is IAccessDeniedResult {
  return (
    !!result &&
    typeof result === 'object' &&
    'accessDenied' in result &&
    (result as IAccessDeniedResult).accessDenied === true
  );
}

/** CMS-040 — backs the full-bleed Correspondence Detail screen's 9 tabs. Every method below
 * independently re-checks the acting user's clearance against the item's SecurityLevel (via the
 * shared checkCorrespondenceClearance guard in services/common/clearance.ts) and writes its own
 * "Viewed {Tab}" audit event as part of the same call — a tab's own fetch is a genuine,
 * independently-gated round trip, not something that only happens to be safe because getDetail()
 * happened to run first. */
export interface ICorrespondenceDetailService {
  /** `undefined` = not found; IAccessDeniedResult = found but the current user's clearance is
   * insufficient. Header/Details-tab fields only — Attachments/Security/Audit/Timeline/Thread/
   * Reminder each have their own method below and are not eagerly fetched here. */
  getDetail(id: string): Promise<CorrespondenceDetailResult>;
  getAttachments(id: string): Promise<TabResult<IAttachmentsResult>>;
  /** Real SharePoint list-item role assignments (Security tab) — also re-queried live by the tab's
   * Refresh action, no caching beyond the default. */
  getSecurityAssignments(id: string): Promise<TabResult<ISecurityPrincipal[]>>;
  getAuditTrail(id: string): Promise<TabResult<IAuditEntry[]>>;
  getTimeline(id: string): Promise<TabResult<ITimelineEvent[]>>;
  /** Every item sharing the given chain/thread reference number, chronological. Clearance is
   * checked against the *opened* item `id` first (so a low-tier chain item never leaks through for
   * a user who can't see the opened item at all), then each returned item is additionally filtered
   * by its own tier as defense-in-depth. */
  getThread(id: string, chainId: string): Promise<TabResult<ICorrespondenceStub[]>>;
  /** CMS-042 — the single active follow-up reminder held on the sent item (undefined when none is
   * set). Clearance-gated + audit-logged like every other tab read. */
  getReminder(id: string): Promise<TabResult<IReminder | undefined>>;
  /** CMS-042 — schedules (or replaces) the follow-up reminder on a sent item. A reminder date is
   * mandatory (AC5): an empty date rejects without writing. Persists the reminder on the item and
   * records a 'ReminderSet' CORMS_Timeline event (AC7); the email on the due date is raised by the
   * scheduled Power Automate flow that triggers off ReminderDate (AC6). */
  saveReminder(id: string, reminder: IReminder): Promise<TabResult<void>>;
  /** CMS-042 — clears the reminder on a sent item (AC4). */
  clearReminder(id: string): Promise<TabResult<void>>;
  /** CMS-008 — manually declares the draft as a final, immutable record: sets Status 'Declared',
   * stamps the declaring user + timestamp (AC3) and a record serial number (AC7), and writes a
   * dedicated 'Record Declared' audit row (AC5/AC9). Clearance-gated like every other method. The
   * caller enforces the Declare permission (AC1) and the approval-complete gate before calling.
   * Templates are optional: a TemplateReference, when present, records provenance only and never
   * prevents an otherwise approved correspondence from being declared or delivered. */
  declareRecord(id: string, declaredBy: string): Promise<TabResult<IDeclarationResult>>;
  /** CMS-024 — the annotations persisted for this correspondence's document (empty when none).
   * RecordsHub/GroupDocs does not store annotations, so this is CORMS's own source of truth
   * (CORMS_Correspondence.AnnotationsJson), read back to redraw them over the plain preview.
   * Clearance-gated like every other read — annotations never leak to a caller below the item's tier. */
  getAnnotations(id: string): Promise<TabResult<IAnnotationItem[]>>;
  /** CMS-024 — persists the full annotation set on the item (replaces, not appends), as the JSON
   * envelope annotationStore.ts produces. Called after the Annotate tab's create→read-back round trip
   * against GroupDocs, and on clear/remove. Clearance-gated and audited. */
  saveAnnotations(id: string, annotations: IAnnotationItem[]): Promise<TabResult<void>>;
  /** CMS-040 — persist inline edits to the Details tab's editable fields (Originating Function,
   * Due Date, Assigned To, Comments). `changeComment` is the mandatory note the user enters in the
   * save modal; the audit row records the exact per-field before→after diff followed by that note.
   * Clearance-gated. Assigned To is resolved to a SharePoint user via ensureUser; an unresolvable
   * value is skipped (and left out of the audit diff) while the other edits still save. */
  updateDetails(id: string, patch: IDetailFieldPatch, changeComment: string): Promise<TabResult<void>>;
  /** CMS-006 — persist the correspondence Status column (CORMS_Correspondence.Status), e.g. to
   * 'Approved' once the approval chain completes so the change is durable and seen by every user,
   * not just the acting approver's session. Clearance-gated; a write to an invalid choice is
   * surfaced as a rejection the caller can ignore. */
  setStatus(id: string, status: CorrespondenceStatus): Promise<TabResult<void>>;
  /** CMS-006/040 Part 6 — append a CORMS_Timeline event (e.g. an approval decision) so the item's
   * Timeline reflects who did what, durably and identically for every viewer. Clearance-gated. */
  addTimelineEntry(id: string, eventType: string, description: string): Promise<TabResult<void>>;
  /** Saves a signed PDF as the correspondence's main document so every signature lands on one
   * file; resolves with the main document's file name. */
  saveSignedMainDocument(id: string, signedPdf: Blob): Promise<TabResult<string>>;
  /** Real Elasticsearch audit write for a detail-view event. Each method above calls this itself as
   * part of its own round trip; exposed here too for the few detail-screen actions that aren't a
   * tab's own data fetch (e.g. Print, Share Link). */
  logView(correspondenceId: string, action: string, details: string): Promise<void>;
}

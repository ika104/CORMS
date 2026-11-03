import type { SPFI } from '@pnp/sp';
import { ITask } from '../../models/ITask';
import { ITaskListFilters } from '../../models/ITaskListFilters';
import { buildTaskFilter } from '../common/buildTaskFilter';
import {
  TASK_LIST_EXPAND,
  TASK_LIST_SELECT,
  ITaskListItem,
  mapTaskRowToStub,
  startOfTodayIso,
} from '../common/mapTaskRow';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { normalizedContains } from '../common/normalizedContains';
import { RoleServiceCore } from '../role/RoleServiceCore';
import { escapeODataLiteral } from '../common/odata';
import { CORMS_ADMIN_CONFIG_SCHEMA, CORMS_TASKS_SCHEMA } from '../../provisioning/listSchemas';

// Same server-side-filter-capped, client-side-paginated approach as CorrespondenceListServiceCore
// (see that file's RESULT_CAP comment) — one convention, not a second one for this list.
const RESULT_CAP = 2000;
const ATTACHMENTS_LIBRARY_TITLE = 'CORMS_Attachments';

interface ITaskAttachmentListItem {
  TaskReference?: string;
  FileName?: string;
  FileLeafRef?: string;
  Title?: string;
}

function normalizeTaskReference(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLocaleUpperCase();
  return normalized || undefined;
}

/**
 * Pure CORMS_Tasks query logic for the Task Inbox (CMS-049) — mirrors
 * CorrespondenceDashboardServiceCore's shape (a single getAll(filters), no per-tile server query).
 * See provisioningCore.ts's file comment for why Core classes only `import type { SPFI }`.
 * TaskList.live.ts is the thin real wrapper.
 *
 * No clearance/SecurityLevel trimming (AC2/AC9 cross-reference): CORMS_Tasks carries no
 * SecurityLevel field in the current schema (listSchemas.ts's CORMS_TASKS_SCHEMA) — confirmed
 * explicitly here rather than silently assuming and skipping a check. If OQ8 later wants tasks
 * security-classified, that's a schema change for a future task, not improvised here.
 *
 * Tiles (AC3/AC11 — All/Pending/Overdue/Team/My Tasks) are NOT separate SharePoint count queries:
 * exactly like My Correspondence's tiles (MyCorrespondenceView.tsx), one predicate object drives
 * both a tile's count and its click-to-filter, evaluated client-side over the single getAll()
 * result — mapTaskRowToStub() precomputes the per-row isMine/isOverdue/isMyTeam flags those
 * predicates read (see that file for the "Overdue" computed-display-state decision).
 *
 * The list's title is resolved through CORMS_TASKS_SCHEMA's own `resolveTitle` hook rather than
 * hard-coded: CORMS_Tasks is the one list in this codebase whose name is admin-configurable (the
 * CORMS_AdminConfig "Task-List" key), and both provisioning and the Part 5 seed script already
 * honor it — a hard-coded 'CORMS_Tasks' here would have queried a list that doesn't exist on any
 * tenant where Power Apps' team named it something else.
 */
export class TaskListServiceCore {
  /** Resolved once per service instance (TaskListServiceLive is a bootstrap singleton), not per
   * query — the configured name can't change mid-session without a reload anyway. */
  private listTitlePromise: Promise<string> | undefined;

  constructor(private readonly sp: SPFI) {}

  public async getAll(filters?: ITaskListFilters): Promise<ITask[]> {
    const todayIso = startOfTodayIso();
    const [listTitle, currentUserId, currentUserRole] = await Promise.all([
      this.resolveListTitle(),
      getCurrentSiteUserId(this.sp),
      // CORMS_UserRoles.Department (Epic 1 schema) — reused as-is for the "Team Tasks" tile, no
      // new lookup: RoleServiceCore already resolves the signed-in user's row on this same `sp`.
      new RoleServiceCore(this.sp).getCurrentUserRole(),
    ]);

    // "All within clearance" has no fixed base condition of its own (unlike a Team/My Tasks
    // server-side scope would) — `Status ne ''` is always true for any real row and keeps this a
    // single, consistent buildTaskFilter call rather than a special no-base-clause code path
    // (mirrors CorrespondenceDashboardServiceCore.getAll's identical reasoning).
    const filterClause = buildTaskFilter(`Status ne ''`, filters, todayIso);

    const items = (await this.sp.web.lists
      .getByTitle(listTitle)
      .items.filter(filterClause)
      .select(...TASK_LIST_SELECT)
      .expand(...TASK_LIST_EXPAND)
      // Fetch newest first before applying the result cap so a new task cannot be displaced by
      // older rows. The UI preserves this order in both table and card views.
      .orderBy('Created', false)
      .top(RESULT_CAP)()) as ITaskListItem[];

    const rows = items.map((item) =>
      mapTaskRowToStub(item, currentUserId, currentUserRole.department, todayIso)
    );
    const attachmentReferences = await this.getTaskAttachmentReferences(rows);
    const rowsWithAttachments = rows.map((row) => ({
      ...row,
      // Power Apps stores uploaded task files in CORMS_Attachments and links them with
      // TaskReference. Keep the task-list attachment flag as a fallback for legacy records.
      hasAttachment: row.hasAttachment || (!!row.referenceNo && attachmentReferences.has(row.referenceNo)),
    }));

    // Assignee is the one filter dimension that can't be a $filter clause: AssignedToUser is a
    // People (Lookup-derived) field and SharePoint REST only supports eq/ne on a projected lookup
    // path, so substringof('…',AssignedToUser/Title) comes back as a 400. Matching client-side
    // over the already-mapped rows keeps the behaviour identical to TaskListServiceMock's (both
    // go through normalizedContains), at the cost of the match being scoped to the RESULT_CAP
    // window — the same approximation this cap already makes for every other dimension.
    const assignee = filters?.assignee;
    if (!assignee) return rowsWithAttachments;
    return rowsWithAttachments.filter((row) => normalizedContains(row.assignee, assignee));
  }

  /**
   * One library query for the page of tasks, rather than a request for every card. The column was
   * introduced by the task Power Apps flow. Files created by older versions of the flow may only
   * carry the reference in their name (for example `TSK-2026-0033_correspondence-1.pdf`), so the
   * match deliberately accepts either source without making the task list depend on the column.
   */
  private async getTaskAttachmentReferences(tasks: ITask[]): Promise<Set<string>> {
    const taskReferences = new Map<string, string>();
    tasks.forEach((task) => {
      const normalized = normalizeTaskReference(task.referenceNo);
      if (normalized && task.referenceNo) taskReferences.set(normalized, task.referenceNo);
    });
    if (taskReferences.size === 0) return new Set<string>();

    try {
      const attachments = (await this.sp.web.lists
        .getByTitle(ATTACHMENTS_LIBRARY_TITLE)
        .items.select('TaskReference', 'FileName', 'FileLeafRef', 'Title')
        .top(RESULT_CAP)()) as ITaskAttachmentListItem[];

      const matchedReferences = new Set<string>();
      attachments.forEach((attachment) => {
        const attachmentValues = [
          attachment.TaskReference,
          attachment.FileName,
          attachment.FileLeafRef,
          attachment.Title,
        ]
          .map(normalizeTaskReference)
          .filter((value): value is string => !!value);
        taskReferences.forEach((originalReference, normalizedReference) => {
          if (
            attachmentValues.some(
              (value) => value === normalizedReference || value.indexOf(normalizedReference) !== -1
            )
          ) {
            matchedReferences.add(originalReference);
          }
        });
      });
      return matchedReferences;
    } catch {
      // TaskReference may not exist yet in a tenant provisioned before task attachments. The
      // standard library name still lets us match files that follow the Power Apps file convention.
      try {
        const attachments = (await this.sp.web.lists
          .getByTitle(ATTACHMENTS_LIBRARY_TITLE)
          .items.select('FileName', 'FileLeafRef', 'Title')
          .top(RESULT_CAP)()) as ITaskAttachmentListItem[];
        const matchedReferences = new Set<string>();
        attachments.forEach((attachment) => {
          const attachmentValues = [attachment.FileName, attachment.FileLeafRef, attachment.Title]
            .map(normalizeTaskReference)
            .filter((value): value is string => !!value);
          taskReferences.forEach((originalReference, normalizedReference) => {
            if (attachmentValues.some((value) => value.indexOf(normalizedReference) !== -1))
              matchedReferences.add(originalReference);
          });
        });
        return matchedReferences;
      } catch {
        return new Set<string>();
      }
    }
  }

  private async resolveListTitle(): Promise<string> {
    if (!this.listTitlePromise) {
      this.listTitlePromise = CORMS_TASKS_SCHEMA.resolveTitle
        ? CORMS_TASKS_SCHEMA.resolveTitle({
            readAdminConfigValue: (key) => this.readAdminConfigValue(key),
          }).catch(() => CORMS_TASKS_SCHEMA.title)
        : Promise.resolve(CORMS_TASKS_SCHEMA.title);
    }
    return this.listTitlePromise;
  }

  /** Mirrors ProvisioningCore's private helper of the same name — a one-row read, never a write,
   * duplicated rather than imported so this query-layer Core class keeps no dependency on the
   * provisioning module (same reasoning as odata.ts's escapeODataLiteral). */
  private async readAdminConfigValue(key: string): Promise<string | undefined> {
    try {
      const items = await this.sp.web.lists
        .getByTitle(CORMS_ADMIN_CONFIG_SCHEMA.title)
        .items.filter(`Title eq '${escapeODataLiteral(key)}'`)
        .top(1)
        .select('Value')();
      return (items as Array<{ Value?: string }>)[0]?.Value;
    } catch {
      return undefined;
    }
  }
}

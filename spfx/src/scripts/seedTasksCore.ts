import type { SPFI } from '@pnp/sp';
import type { IList } from '@pnp/sp/lists';
import { CORMS_TASKS_SCHEMA } from '../provisioning/listSchemas';
import { ProvisioningCore } from '../services/provisioning/provisioningCore';
import { escapeODataLiteral } from '../services/common/odata';
import { ISeedTasksResult } from '../services/interfaces/ISeedTasksService';

/** Idempotency marker (Part 5) — every sample row's ReferenceNo carries this prefix, checked
 * per-row before insert (mirrors ProvisioningCore.ensureSeedRowStep's exact "match on a field,
 * insert only if absent, never overwrite" behavior), so re-running the script never duplicates
 * rows and a partial prior run (e.g. interrupted mid-way) is safely completed on the next run. */
export const SEED_MARKER_PREFIX = 'SEED-TSK-';

const CORRESPONDENCE_LIST_TITLE = 'CORMS_Correspondence';
const RELATED_CORRESPONDENCE_SAMPLE_COUNT = 2;

interface ISeedRowSpec {
  referenceNoSuffix: string;
  title: string;
  taskType: 'To Do' | 'Follow-up Task' | 'Reminder';
  priority: 'Low' | 'Normal' | 'High';
  status: 'Pending' | 'In Progress' | 'Completed';
  dueDateOffsetDays: number;
  team: string;
  assignToCurrentUser: boolean;
  useRelatedCorrespondence: boolean;
  description: string;
}

// Part 5's fixed sample set — deliberately covers every TaskType/Priority/Status value at least
// once, three rows with a past DueDate (two Pending/In Progress, one Completed) to exercise the
// computed-Overdue decision from mapTaskRow.ts's computeTaskDisplayStatus (a Completed-but-past-due
// row must NOT compute as Overdue), a mix of assigned-to-current-user vs unassigned rows, four
// distinct AssignedToTeam values, and two rows wired to a real CORMS_Correspondence id when one
// exists.
const SEED_ROW_SPECS: ISeedRowSpec[] = [
  { referenceNoSuffix: '0001', title: 'Follow up on vendor invoice approval', taskType: 'To Do', priority: 'High', status: 'Pending', dueDateOffsetDays: 5, team: 'Finance', assignToCurrentUser: true, useRelatedCorrespondence: false, description: 'Sample task seeded for testing (CMS-049).' },
  { referenceNoSuffix: '0002', title: 'Prepare quarterly IT security review', taskType: 'Follow-up Task', priority: 'Normal', status: 'In Progress', dueDateOffsetDays: 10, team: 'IT', assignToCurrentUser: true, useRelatedCorrespondence: false, description: 'Sample task seeded for testing (CMS-049).' },
  { referenceNoSuffix: '0003', title: 'Remind Legal about contract renewal deadline', taskType: 'Reminder', priority: 'Low', status: 'Pending', dueDateOffsetDays: -3, team: 'Legal', assignToCurrentUser: false, useRelatedCorrespondence: false, description: 'Sample task seeded for testing (CMS-049) — past due, exercises computed-Overdue.' },
  { referenceNoSuffix: '0004', title: 'Escalate overdue HR policy sign-off', taskType: 'To Do', priority: 'High', status: 'Pending', dueDateOffsetDays: -10, team: 'HR', assignToCurrentUser: true, useRelatedCorrespondence: false, description: 'Sample task seeded for testing (CMS-049) — past due, exercises computed-Overdue.' },
  { referenceNoSuffix: '0005', title: 'Archive closed Finance correspondence batch', taskType: 'Follow-up Task', priority: 'Normal', status: 'Completed', dueDateOffsetDays: -7, team: 'Finance', assignToCurrentUser: false, useRelatedCorrespondence: false, description: 'Sample task seeded for testing (CMS-049) — past due but Completed, must NOT compute as Overdue.' },
  { referenceNoSuffix: '0006', title: 'Reminder: renew IT support ticketing license', taskType: 'Reminder', priority: 'Low', status: 'In Progress', dueDateOffsetDays: 2, team: 'IT', assignToCurrentUser: true, useRelatedCorrespondence: true, description: 'Sample task seeded for testing (CMS-049).' },
  { referenceNoSuffix: '0007', title: 'Review Legal correspondence for follow-up action', taskType: 'To Do', priority: 'Normal', status: 'Pending', dueDateOffsetDays: 15, team: 'Legal', assignToCurrentUser: false, useRelatedCorrespondence: true, description: 'Sample task seeded for testing (CMS-049).' },
  { referenceNoSuffix: '0008', title: 'Close out HR onboarding follow-up', taskType: 'Follow-up Task', priority: 'High', status: 'Completed', dueDateOffsetDays: -20, team: 'HR', assignToCurrentUser: true, useRelatedCorrespondence: false, description: 'Sample task seeded for testing (CMS-049).' },
];

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/**
 * Pure sample-data-insertion logic for CORMS_Tasks (Part 5) — a standalone concern, deliberately
 * separate from ProvisioningCore's schema-creation flow (which only ever creates structure, never
 * sample data). Reuses ProvisioningCore's read-only getStatus() rather than duplicating the
 * schema-existence check or the "honor CORMS_AdminConfig's Task-List key" name resolution (that
 * call already reports the resolved title) — but never calls provisionAll()/ensureFieldStep(), so
 * this script can never create or modify list structure, only insert rows into a list already
 * confirmed complete.
 *
 * See provisioningCore.ts's file comment for why Core classes only `import type { SPFI }`.
 * seedTasks.ts is the thin real wrapper.
 */
export class SeedTasksCore {
  private readonly provisioningCore: ProvisioningCore;

  constructor(private readonly sp: SPFI) {
    this.provisioningCore = new ProvisioningCore(sp);
  }

  public async run(): Promise<ISeedTasksResult> {
    const listTitle = await this.verifySchemaAndResolveTitle();
    const list = this.sp.web.lists.getByTitle(listTitle);

    const [currentUserId, relatedCorrespondenceIds] = await Promise.all([
      this.getCurrentUserId(),
      this.getSampleCorrespondenceIds(),
    ]);

    let inserted = 0;
    let skippedExisting = 0;

    for (const spec of SEED_ROW_SPECS) {
      const referenceNo = `${SEED_MARKER_PREFIX}${spec.referenceNoSuffix}`;
      const alreadyExists = await this.rowExists(list, referenceNo);
      if (alreadyExists) {
        skippedExisting += 1;
        continue;
      }

      const relatedCorrespondenceId =
        spec.useRelatedCorrespondence && relatedCorrespondenceIds.length > 0
          ? String(relatedCorrespondenceIds[inserted % relatedCorrespondenceIds.length])
          : '';

      const row: Record<string, unknown> = {
        Title: spec.title,
        TaskType: spec.taskType,
        Priority: spec.priority,
        Status: spec.status,
        DueDate: isoDateOffset(spec.dueDateOffsetDays),
        AssignedToTeam: spec.team,
        RelatedCorrespondenceId: relatedCorrespondenceId,
        Description: spec.description,
        ReferenceNo: referenceNo,
      };
      if (spec.assignToCurrentUser) {
        row.AssignedToUserId = currentUserId;
      }

      await list.items.add(row);
      inserted += 1;
    }

    return { inserted, skippedExisting, total: SEED_ROW_SPECS.length };
  }

  /** Part 0's schema-confirmation requirement, applied here too (Part 6's "schema-confirmation
   * check fails clearly if run against a list missing an expected column") — reuses
   * ProvisioningCore.getStatus(), already read-only/verify-only, rather than a second
   * existence-check implementation. Never creates anything: a missing list or a missing column
   * fails fast with a clear error instead of silently inserting against an incomplete list.
   *
   * getStatus() already applies CORMS_TASKS_SCHEMA's resolveTitle hook (honoring
   * CORMS_AdminConfig's "Task-List" key) and reports the result as `resolvedTitle`, so that value
   * is returned directly — re-resolving it afterwards was a second, identical CORMS_AdminConfig
   * round trip for an answer already in hand. */
  private async verifySchemaAndResolveTitle(): Promise<string> {
    const [status] = await this.provisioningCore.getStatus([CORMS_TASKS_SCHEMA]);
    if (!status.exists) {
      throw new Error(
        `seedTasks: CORMS_Tasks ("${status.resolvedTitle}") does not exist yet — run Provision Lists first.`
      );
    }
    if (status.fieldCount < status.expectedFieldCount) {
      throw new Error(
        `seedTasks: CORMS_Tasks ("${status.resolvedTitle}") is missing ${status.expectedFieldCount - status.fieldCount} ` +
          `expected column(s) (${status.fieldCount}/${status.expectedFieldCount} present) — run Provision Lists first.`
      );
    }
    return status.resolvedTitle;
  }

  private async rowExists(list: IList, referenceNo: string): Promise<boolean> {
    const existing = await list.items.filter(`ReferenceNo eq '${escapeODataLiteral(referenceNo)}'`).top(1)();
    return (existing as unknown[]).length > 0;
  }

  private async getCurrentUserId(): Promise<number> {
    const user = await this.sp.web.currentUser();
    return (user as { Id: number }).Id;
  }

  /** Best-effort — an empty/missing CORMS_Correspondence list just means the two
   * RelatedCorrespondenceId sample rows are left blank (per Part 5's own instruction), not a
   * reason to fail the whole seed run. */
  private async getSampleCorrespondenceIds(): Promise<number[]> {
    try {
      const items = await this.sp.web.lists
        .getByTitle(CORRESPONDENCE_LIST_TITLE)
        .items.select('Id')
        .top(RELATED_CORRESPONDENCE_SAMPLE_COUNT)();
      return (items as Array<{ Id: number }>).map((i) => i.Id);
    } catch {
      return [];
    }
  }
}

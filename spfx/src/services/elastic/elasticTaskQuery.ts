import { ITask, TaskPriority, TaskType } from '../../models/ITask';
import { computeTaskDisplayStatus, startOfTodayIso } from '../common/mapTaskRow';
import { flattenSource, pickField, IElasticHit } from './elasticQuery';

/**
 * CMS-025/046 — the Tasks search type also goes through Elasticsearch (every search on the Search
 * screen does), so a CORMS_Tasks item indexed by the RecordsHub per-site sync has to map to the
 * same ITask shape the grid renders. Mirrors mapElasticHitToCorrespondence: item columns live under
 * `fields.*` (flattenSource merges them to the root), field names probed defensively against the
 * CORMS_Tasks column names (mapTaskRow.ts's ITaskListItem) with camelCase fallbacks. Status is the
 * same computed display state as the SharePoint path (Overdue derived from DueDate, never trusted
 * verbatim) so both sources agree.
 */
const VALID_TASK_TYPES: TaskType[] = ['To Do', 'Follow-up Task', 'Reminder'];
const VALID_TASK_PRIORITIES: TaskPriority[] = ['Low', 'Normal', 'High'];

function mapType(raw: string | undefined): TaskType {
  return (VALID_TASK_TYPES as string[]).indexOf(raw ?? '') !== -1 ? (raw as TaskType) : 'To Do';
}

function mapPriority(raw: string | undefined): TaskPriority {
  return (VALID_TASK_PRIORITIES as string[]).indexOf(raw ?? '') !== -1 ? (raw as TaskPriority) : 'Normal';
}

export function mapElasticHitToTask(hit: IElasticHit): ITask {
  const src = flattenSource(hit._source);
  const dueRaw = pickField(src, ['DueDate', 'dueDate']);
  const status = computeTaskDisplayStatus(pickField(src, ['Status', 'status']), dueRaw, startOfTodayIso());
  const today = startOfTodayIso();
  const assignee = pickField(src, ['AssignedToUser', 'AssignedTo', 'assignee']) ?? '';
  return {
    id: pickField(src, ['ItemId', 'ItemID', 'TaskId', 'Id', 'id']) ?? hit._id ?? '',
    subject: pickField(src, ['Title', 'Subject', 'subject']) ?? '',
    type: mapType(pickField(src, ['TaskType', 'type'])),
    priority: mapPriority(pickField(src, ['Priority', 'priority'])),
    status,
    dueDate: dueRaw ? dueRaw.slice(0, 10) : '',
    assignee,
    // Elasticsearch's task projection currently carries a display string, not the SharePoint
    // Person object. Preserve that result as one avatar until the index exposes a multi-person
    // expansion; the live list path retains every assignee and their email.
    assignees: assignee ? [{ displayName: assignee }] : [],
    hasAttachment: false,
    isMine: false,
    isOverdue: !!dueRaw && dueRaw < today && status !== 'Completed',
    referenceNo: pickField(src, ['ReferenceNo', 'referenceNo']),
    team: pickField(src, ['AssignedToTeam', 'team']),
    relatedCorrespondenceId: pickField(src, ['RelatedCorrespondenceId', 'relatedCorrespondenceId']),
    description: pickField(src, ['Description', 'description']),
  };
}

/**
 * CMS-046 AC5 — the Task search type's structured filters (Type / Priority / Status / Assignee),
 * applied client-side. Shared by the mock and the live transport so both honour the same rules —
 * the free-text term itself is handled by Elasticsearch (live) or matchesTaskTerm (mock).
 */
export function taskMatchesFilters(task: ITask, filters: Record<string, string>): boolean {
  if (filters.type && task.type !== filters.type) return false;
  if (filters.priority && task.priority !== filters.priority) return false;
  if (filters.status && task.status !== filters.status) return false;
  if (filters.assignee && task.assignee.toLowerCase().indexOf(filters.assignee.toLowerCase()) === -1)
    return false;
  return true;
}

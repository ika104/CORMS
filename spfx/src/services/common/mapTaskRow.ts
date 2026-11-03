import { ITask, ITaskAssignee, TaskPriority, TaskStatus, TaskType } from '../../models/ITask';

/** CORMS_Tasks row shape as read over REST/PnPjs, AssignedToUser expanded to `{Title}` with its
 * shadow Id field selected separately (cheaper than expanding just for the Id — mirrors
 * CorrespondenceListServiceCore's AssignedToId usage). Mirrors mapCorrespondenceRow.ts's
 * ICorrespondenceListItem convention: the one place that reconciles the SharePoint list shape
 * (listSchemas.ts's CORMS_TASKS_SCHEMA) with the front-end ITask model. */
export interface ITaskListItem {
  Id: number;
  Title?: string;
  TaskType?: string;
  Priority?: string;
  Status?: string;
  Created?: string;
  DueDate?: string;
  Attachments?: boolean;
  AssignedToTeam?: string;
  /** A multi-person SharePoint field returns an array; the single-object form remains supported
   * for older lists and fixtures provisioned before AllowMultipleValues was enabled. */
  AssignedToUserId?: number | number[];
  AssignedToUser?: ITaskPerson | ITaskPerson[];
  RelatedCorrespondenceId?: string;
  Description?: string;
  ReferenceNo?: string;
}

interface ITaskPerson {
  Id?: number;
  Title?: string;
  EMail?: string;
  /** Tolerate the spelling used by a few non-PnP fixtures/integrations. */
  Email?: string;
}

const VALID_TASK_TYPES: TaskType[] = ['To Do', 'Follow-up Task', 'Reminder'];
const VALID_TASK_PRIORITIES: TaskPriority[] = ['Low', 'Normal', 'High'];

function mapTaskType(raw: string | undefined): TaskType {
  return (VALID_TASK_TYPES as string[]).indexOf(raw ?? '') !== -1 ? (raw as TaskType) : 'To Do';
}

function mapTaskPriority(raw: string | undefined): TaskPriority {
  return (VALID_TASK_PRIORITIES as string[]).indexOf(raw ?? '') !== -1 ? (raw as TaskPriority) : 'Normal';
}

function mapRawStatus(raw: string | undefined): TaskStatus {
  if (raw === 'In Progress' || raw === 'Completed') return raw;
  // 'Overdue' is exclusively a computed display state (see computeTaskDisplayStatus below) — a
  // literal stored 'Overdue' is never trusted verbatim either, per the flagged AC4 decision
  // ("regardless of what's literally stored"). Falls back to 'Pending', the safe "not actually
  // known to be overdue yet" state, same as any other unrecognized raw value.
  return 'Pending';
}

/** Maps the SharePoint Person/Group expansion to a stable, display-ready collection. */
function mapAssignees(value: ITaskListItem['AssignedToUser']): ITaskAssignee[] {
  const people = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();

  return people.reduce<ITaskAssignee[]>((assignees, person) => {
    const email = person.EMail ?? person.Email;
    const displayName = person.Title?.trim() || email?.trim() || '';
    if (!displayName) return assignees;

    const identity = String(person.Id ?? email ?? displayName).toLocaleLowerCase();
    if (seen.has(identity)) return assignees;
    seen.add(identity);

    assignees.push({
      id: typeof person.Id === 'number' ? person.Id : undefined,
      displayName,
      email: email?.trim() || undefined,
    });
    return assignees;
  }, []);
}

function assignedToCurrentUser(
  assignees: ITaskAssignee[],
  assigneeIds: ITaskListItem['AssignedToUserId'],
  currentUserId: number
): boolean {
  if (assignees.some((assignee) => assignee.id === currentUserId)) return true;
  const ids = Array.isArray(assigneeIds) ? assigneeIds : assigneeIds === undefined ? [] : [assigneeIds];
  return ids.indexOf(currentUserId) !== -1;
}

/** SharePoint DateTime values are ISO 8601 and lexically sortable, so date-only comparison
 * against "today" (UTC midnight) needs no Date-object arithmetic — a plain string compare against
 * this literal is enough, matching buildTaskFilter.ts's dateLiteral. */
export function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/**
 * Flagged design decision (CMS-049 AC4, cross-referenced against AC7's four literal Status
 * values): "Overdue" is treated as a computed display state, not a value CORMS trusts verbatim
 * from the Status column. Task status changes happen inside Power Apps (AC8, out of this task's
 * scope) — this task's SPFx query layer cannot guarantee Power Apps proactively flips a task's
 * stored Status to 'Overdue' the moment its due date passes. A task shows as Overdue (tiles,
 * filtering, grid display) whenever DueDate < today AND the (mapped) Status isn't Completed,
 * regardless of what's literally stored — a Completed task past its due date is never flagged.
 *
 * TODO(confirm): if Power Apps is later confirmed to reliably write Status='Overdue' itself, this
 * computed-override logic could be simplified to a direct field read — kept as computed here
 * since we don't control that write path.
 */
export function computeTaskDisplayStatus(
  raw: string | undefined,
  dueDate: string | undefined,
  todayIso: string
): TaskStatus {
  const mapped = mapRawStatus(raw);
  if (mapped === 'Completed') return 'Completed';
  if (dueDate && dueDate < todayIso) return 'Overdue';
  return mapped;
}

export function mapTaskRowToStub(
  item: ITaskListItem,
  currentUserId: number,
  currentUserDepartment: string | undefined,
  todayIso: string = startOfTodayIso()
): ITask {
  const displayStatus = computeTaskDisplayStatus(item.Status, item.DueDate, todayIso);
  const assignees = mapAssignees(item.AssignedToUser);
  return {
    id: String(item.Id),
    subject: item.Title ?? '',
    type: mapTaskType(item.TaskType),
    priority: mapTaskPriority(item.Priority),
    status: displayStatus,
    createdAt: item.Created,
    dueDate: item.DueDate ?? '',
    assignee: assignees.map((assignee) => assignee.displayName).join(', '),
    assignees,
    // SharePoint's built-in list-item flag is shown only as a visual indicator. Opening or
    // downloading a task attachment remains a Power Apps action.
    hasAttachment: item.Attachments === true,
    isMine: assignedToCurrentUser(assignees, item.AssignedToUserId, currentUserId),
    isOverdue: displayStatus === 'Overdue',
    referenceNo: item.ReferenceNo ?? '',
    team: item.AssignedToTeam ?? '',
    isMyTeam:
      !!currentUserDepartment && !!item.AssignedToTeam && item.AssignedToTeam === currentUserDepartment,
    relatedCorrespondenceId: item.RelatedCorrespondenceId || undefined,
    description: item.Description ?? '',
  };
}

export const TASK_LIST_SELECT = [
  'Id',
  'Title',
  'TaskType',
  'Priority',
  'Status',
  'Created',
  'DueDate',
  'Attachments',
  'AssignedToTeam',
  'AssignedToUserId',
  'AssignedToUser/Id',
  'AssignedToUser/Title',
  'AssignedToUser/EMail',
  'RelatedCorrespondenceId',
  'Description',
  'ReferenceNo',
];

export const TASK_LIST_EXPAND = ['AssignedToUser'];

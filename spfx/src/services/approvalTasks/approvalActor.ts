import { IApprovalTask } from '../../models/IApprovalTask';

export interface IApprovalActor {
  name?: string;
  email?: string;
}

function sameName(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Assignees are recorded by their people-picker key (a claims login containing the email) and
 * display name; the email is the reliable match when both sides have one. */
function isAssignee(task: IApprovalTask, actor: IApprovalActor): boolean {
  const key = (task.assignedToId ?? '').toLowerCase();
  const email = (actor.email ?? '').trim().toLowerCase();
  if (key.indexOf('@') !== -1 && email) return key === email || key.endsWith(`|${email}`);
  return sameName(task.assignedToName, actor.name);
}

/**
 * The assignee an action is taken for when someone else takes it (an administrator or a delegate),
 * or undefined when the assignee acts themselves. A team task without an individual assignee can be
 * actioned by any member, so it never reads as "on behalf of".
 */
export function actingOnBehalfOf(task: IApprovalTask, actor: IApprovalActor): string | undefined {
  if (!task.assignedToId && !task.assignedToName) return undefined;
  return isAssignee(task, actor) ? undefined : (task.assignedToName ?? task.assignedToId);
}

/** For an already-decided task, whom the recorded decider acted for (only names are stored). */
export function decidedOnBehalfOf(task: IApprovalTask): string | undefined {
  if (task.status === 'Pending' || !task.decidedBy || !task.assignedToName) return undefined;
  return sameName(task.decidedBy, task.assignedToName) ? undefined : task.assignedToName;
}

/** The task is the user's: assigned to them individually, or a team task for their department. */
export function isAssignedTo(task: IApprovalTask, user: IApprovalActor & { department?: string }): boolean {
  if (task.assignedToId || task.assignedToName) return isAssignee(task, user);
  return sameName(task.assignedToTeam, user.department);
}

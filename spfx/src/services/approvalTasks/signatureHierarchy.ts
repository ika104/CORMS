/**
 * CMS-048 — the signature-hierarchy rules layered on the CMS-006 approval tasks: which
 * participant(s) may sign the live step *right now* (the "active assignee" set), the sequential
 * ascending-seniority progression of a Department step, idempotent signing, and the not-an-active-
 * assignee gate. Pure and dependency-free so every rule is unit-testable.
 *
 * How a step dispatches (from its tasks' stepType + mode):
 *  - Department, mode 'All'  → sequential: only the lowest-seniority *pending* member is active;
 *    the item advances up the ladder as each signs (AC1/AC2); completes when all have signed (AC3).
 *  - Department, mode 'Any'  → any member's signature is enough, so every pending member is active
 *    and the step completes on the first signature (AC2 "if any is selected …").
 *  - Group, mode 'Any' (grouping enabled)  → all members dispatched at once; first signature
 *    completes it and the rest are released (AC4).
 *  - Group, mode 'All' (no grouping)  → all dispatched at once; completes only when all sign (AC5).
 *  - Reviewer → the single assignee is active until they sign.
 */

import { IApprovalTask } from '../../models/IApprovalTask';

function isDepartment(task: IApprovalTask | undefined): boolean {
  return task?.stepType === 'Department';
}

/** Ascending-seniority sort for a Department step's member tasks (1 = most junior signs first).
 * Tasks without a seniority sort last, stably. */
function bySeniority(a: IApprovalTask, b: IApprovalTask): number {
  return (a.seniority ?? Number.MAX_SAFE_INTEGER) - (b.seniority ?? Number.MAX_SAFE_INTEGER);
}

/** True once the step is finished per its Any/All rule — used to know when remaining members are
 * released and no one else may sign. A reject/return also ends the step. */
export function isStepComplete(stepTasks: IApprovalTask[]): boolean {
  if (stepTasks.some((t) => t.status === 'Rejected' || t.status === 'Returned')) return true;
  const mode = stepTasks[0]?.mode ?? 'All';
  const approved = stepTasks.filter((t) => t.status === 'Approved').length;
  return mode === 'Any' ? approved >= 1 : approved === stepTasks.length && stepTasks.length > 0;
}

/**
 * The task id(s) currently allowed to sign within a step. Empty once the step is complete
 * (everyone else is released). For a sequential Department 'All' step this is exactly the single
 * lowest-seniority pending member; for every parallel case it is every pending member.
 */
export function activeAssigneeTaskIds(stepTasks: IApprovalTask[]): string[] {
  if (isStepComplete(stepTasks)) return [];
  const pending = stepTasks.filter((t) => t.status === 'Pending');
  if (pending.length === 0) return [];

  const mode = stepTasks[0]?.mode ?? 'All';
  // Sequential ascending seniority: only the most-junior unsigned member holds the item (AC1/AC2).
  if (isDepartment(stepTasks[0]) && mode === 'All') {
    const next = [...pending].sort(bySeniority)[0];
    return [next.id];
  }
  // Parallel: Group (Any/All) and Department 'Any' — every pending member may sign.
  return pending.map((t) => t.id);
}

/** AC7 — is this task a current active assignee of its (live) step? */
export function isActiveAssignee(stepTasks: IApprovalTask[], taskId: string): boolean {
  return activeAssigneeTaskIds(stepTasks).indexOf(taskId) !== -1;
}

export type SignAttemptResult =
  | { ok: true; task: IApprovalTask }
  | { ok: false; reason: 'not-found' | 'wrong-user' | 'already-signed' | 'not-active' | 'step-complete' };

/**
 * Decides whether `userId` may record a signature on `taskId` within its step, enforcing AC6/AC7:
 *  - 'not-found'      — no such task in the step;
 *  - 'already-signed' — the task is already Approved by this flow (idempotent no-op, AC6);
 *  - 'wrong-user'     — the acting user is not this task's assignee;
 *  - 'step-complete'  — the step is already finished (remaining members released, AC4);
 *  - 'not-active'     — a more-junior member still holds the item (sequential Department, AC1/AC2).
 */
export function evaluateSignAttempt(stepTasks: IApprovalTask[], taskId: string, userId: string | undefined): SignAttemptResult {
  const task = stepTasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, reason: 'not-found' };
  if (task.status === 'Approved') return { ok: false, reason: 'already-signed' };
  // A member task is assigned to a person; only that person may sign it (a team task with no
  // assignee is open to whoever stands in for the unit in this DEV build).
  if (task.assignedToId && userId && task.assignedToId !== userId) return { ok: false, reason: 'wrong-user' };
  if (isStepComplete(stepTasks)) return { ok: false, reason: 'step-complete' };
  if (!isActiveAssignee(stepTasks, taskId)) return { ok: false, reason: 'not-active' };
  return { ok: true, task };
}

export function canSign(stepTasks: IApprovalTask[], taskId: string, userId: string | undefined): boolean {
  return evaluateSignAttempt(stepTasks, taskId, userId).ok;
}

/** AC4 — pending member tasks that are released because their step is already complete (another
 * member's signature satisfied it): they can no longer be signed. */
export function releasedTaskIds(stepTasks: IApprovalTask[]): string[] {
  if (!isStepComplete(stepTasks)) return [];
  return stepTasks.filter((t) => t.status === 'Pending').map((t) => t.id);
}

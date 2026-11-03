import {
  ApprovalInboxState,
  IApprovalCorrespondenceSummary,
  IApprovalInboxItem,
  IApprovalInboxScope,
  IApprovalInboxSource,
} from '../../models/IApprovalInbox';
import { IApprovalTask } from '../../models/IApprovalTask';
import { evaluateChainProgress, isTaskCancelled } from './approvalProgress';
import { isAssignedTo } from './approvalActor';
import { isActiveAssignee } from './signatureHierarchy';

function stateOf(task: IApprovalTask, chainTasks: IApprovalTask[]): ApprovalInboxState {
  const progress = evaluateChainProgress(chainTasks);
  if (isTaskCancelled(task, progress)) return 'Cancelled';
  if (task.status !== 'Pending') return 'Completed';
  const step = progress.steps.find((s) => s.stepOrder === task.stepOrder);
  const stepTasks = chainTasks.filter((t) => t.stepOrder === task.stepOrder);
  return step?.active && isActiveAssignee(stepTasks, task.id) ? 'ToDo' : 'Waiting';
}

function isPastDue(dueDate: string | undefined, now: Date): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due.getTime() < now.getTime();
}

/** The inbox rows for a scope, newest correspondence first within the source order. */
export function buildApprovalInbox(
  source: IApprovalInboxSource,
  scope: IApprovalInboxScope,
  now: Date = new Date()
): IApprovalInboxItem[] {
  const summaries = new Map<string, IApprovalCorrespondenceSummary>(
    source.correspondences.map((summary) => [summary.id, summary])
  );
  return source.tasks
    .filter((task) => scope.allUsers || isAssignedTo(task, scope))
    .map((task) => {
      const chainTasks = source.tasks.filter((t) => t.correspondenceId === task.correspondenceId);
      const state = stateOf(task, chainTasks);
      const correspondence = summaries.get(task.correspondenceId) ?? {
        id: task.correspondenceId,
        subject: task.referenceNo ?? task.correspondenceId,
        referenceNumber: task.referenceNo,
      };
      return {
        task,
        chainTasks,
        correspondence,
        state,
        isOverdue: (state === 'ToDo' || state === 'Waiting') && isPastDue(correspondence.dueDate, now),
      };
    });
}

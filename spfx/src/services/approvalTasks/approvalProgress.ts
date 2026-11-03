import { CorrespondenceStatus } from '../../models/ICorrespondence';
import { IApprovalTask } from '../../models/IApprovalTask';

/**
 * CMS-006 — pure evaluation of an approval chain's progress from its Task items (the single source
 * of truth, AC9). Given every task for a correspondence, it derives each step's status, which step
 * is currently active, the overall outcome, and the status the correspondence should carry. Kept
 * free of any service/DOM dependency so the Any/All completion rules (AC14) and the sequential
 * step ordering (AC4) are unit-testable on their own.
 */

/** 'Cancelled' is derived for display: a step after a rejected one is never reached. */
export type StepStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned' | 'Cancelled';
export type ChainOutcome = 'InProgress' | 'Approved' | 'Rejected' | 'Returned';

export interface IStepProgress {
  stepOrder: number;
  stepName: string;
  status: StepStatus;
  /** True for the earliest not-yet-approved step — where the pending decisions live. */
  active: boolean;
}

export interface IChainProgress {
  steps: IStepProgress[];
  /** The earliest step that isn't approved yet (undefined once the whole chain is approved). */
  activeStepOrder?: number;
  outcome: ChainOutcome;
  /** The status the correspondence should carry given the chain state: 'Approved' when every step
   * is approved; 'InReview' while steps remain; 'Rejected' once a step rejects it (final); 'Draft'
   * when a step returns it to the originator for rework. */
  correspondenceStatus: CorrespondenceStatus;
}

/** A step's decision from its tasks: a reject or return by any participant halts the step
 * regardless of mode; otherwise 'Any' needs one approval and 'All' needs every task approved. */
export function evaluateStepStatus(tasks: IApprovalTask[]): StepStatus {
  if (tasks.some((task) => task.status === 'Rejected')) return 'Rejected';
  if (tasks.some((task) => task.status === 'Returned')) return 'Returned';
  const mode = tasks[0]?.mode ?? 'All';
  const approved = tasks.filter((task) => task.status === 'Approved').length;
  if (mode === 'Any') return approved >= 1 ? 'Approved' : 'Pending';
  return approved === tasks.length && tasks.length > 0 ? 'Approved' : 'Pending';
}

export function evaluateChainProgress(tasks: IApprovalTask[]): IChainProgress {
  const orders = Array.from(new Set(tasks.map((t) => t.stepOrder))).sort((a, b) => a - b);
  const steps: IStepProgress[] = [];
  let activeStepOrder: number | undefined;
  let outcome: ChainOutcome = 'Approved'; // stays 'Approved' only if every step approves

  for (const order of orders) {
    const stepTasks = tasks.filter((t) => t.stepOrder === order);
    const status: StepStatus = outcome === 'Rejected' ? 'Cancelled' : evaluateStepStatus(stepTasks);
    // The active step is the first that isn't approved; steps after it aren't reached yet.
    const active = activeStepOrder === undefined && status !== 'Approved';
    if (active) activeStepOrder = order;
    steps.push({ stepOrder: order, stepName: stepTasks[0]?.stepName ?? '', status, active });
    if (status !== 'Approved' && outcome === 'Approved') {
      outcome = status === 'Rejected' ? 'Rejected' : status === 'Returned' ? 'Returned' : 'InProgress';
    }
  }

  const correspondenceStatus: CorrespondenceStatus =
    outcome === 'Approved'
      ? 'Approved'
      : outcome === 'InProgress'
        ? 'InReview'
        : outcome === 'Rejected'
          ? 'Rejected'
          : 'Draft';

  return { steps, activeStepOrder, outcome, correspondenceStatus };
}

/** A rejection ends the chain and cancels every task still waiting. Rejections recorded before
 * cancellation was stored left those tasks Pending, so they also read as cancelled. */
export function isTaskCancelled(task: IApprovalTask, progress: IChainProgress): boolean {
  return task.status === 'Cancelled' || (progress.outcome === 'Rejected' && task.status === 'Pending');
}

/** The current user's still-pending task in the active step, if any — what the detail screen offers
 * Approve/Reject/Return on. A Department step (no assignee) is actionable by any viewer standing in
 * for that unit in this DEV build; a Reviewer/Group task only by its assignee. */
export function findActionableTask(
  tasks: IApprovalTask[],
  progress: IChainProgress,
  userId: string | undefined
): IApprovalTask | undefined {
  if (progress.activeStepOrder === undefined) return undefined;
  return tasks.find(
    (task) =>
      task.stepOrder === progress.activeStepOrder &&
      task.status === 'Pending' &&
      (!task.assignedToId || (!!userId && task.assignedToId === userId))
  );
}

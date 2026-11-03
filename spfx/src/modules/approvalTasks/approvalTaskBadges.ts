import { StatusBadgeTone } from '../../components/common/StatusBadge';
import { ApprovalInboxState } from '../../models/IApprovalInbox';
import { IApprovalTask } from '../../models/IApprovalTask';
import { StepStatus } from '../../services/approvalTasks/approvalProgress';

export interface IApprovalBadge {
  labelKey: string;
  tone: StatusBadgeTone;
}

const STEP_TONES: Record<StepStatus, StatusBadgeTone> = {
  Pending: 'neutral',
  Approved: 'success',
  Rejected: 'danger',
  Returned: 'warning',
  Cancelled: 'neutral',
};

export function stepStatusTone(status: StepStatus): StatusBadgeTone {
  return STEP_TONES[status];
}

/** A completed task shows its decision; otherwise the task's place in the chain. */
export function inboxStateBadge(state: ApprovalInboxState, task: IApprovalTask): IApprovalBadge {
  if (state === 'Completed' && task.status !== 'Pending' && task.status !== 'Cancelled') {
    return { labelKey: `correspondenceDetail.approvals.status.${task.status}`, tone: STEP_TONES[task.status] };
  }
  if (state === 'ToDo') return { labelKey: 'approvalTasks.state.ToDo', tone: 'info' };
  if (state === 'Waiting') return { labelKey: 'approvalTasks.state.Waiting', tone: 'neutral' };
  return { labelKey: 'correspondenceDetail.approvals.status.Cancelled', tone: 'neutral' };
}

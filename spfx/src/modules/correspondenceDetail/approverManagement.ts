import { CorrespondenceStatus } from '../../models/ICorrespondence';
import { IApprovalTask } from '../../models/IApprovalTask';
import { ChainOutcome } from '../../services/approvalTasks/approvalProgress';

/** Statuses in which the approval chain is still open to new approvers. */
const MANAGEABLE_STATUSES: CorrespondenceStatus[] = ['Registered', 'InReview', 'Approved'];

export interface IApproverManagementContext {
  viewerIsRequestor?: boolean;
  viewerIsSystemAdmin?: boolean;
  mainDocumentSigned?: boolean;
  status: CorrespondenceStatus;
  /** Undefined while the correspondence has no approval tasks yet. */
  chainOutcome?: ChainOutcome;
}

/**
 * Approvers are managed by the correspondence's requestor or a System Administrator. An
 * already-signed document needs none, and a rejected or returned chain is closed.
 */
export function canManageApprovers(context: IApproverManagementContext): boolean {
  return (
    (context.viewerIsRequestor === true || context.viewerIsSystemAdmin === true) &&
    !context.mainDocumentSigned &&
    MANAGEABLE_STATUSES.indexOf(context.status) !== -1 &&
    context.chainOutcome !== 'Rejected' &&
    context.chainOutcome !== 'Returned'
  );
}

/** Steps added later run after every existing step. */
export function nextStepOrder(tasks: IApprovalTask[]): number {
  return tasks.reduce((max, task) => Math.max(max, task.stepOrder), 0) + 1;
}

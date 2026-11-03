import { CorrespondencePriority, CorrespondenceStatus } from './ICorrespondence';
import { IApprovalTask } from './IApprovalTask';

/**
 * The Approval Tasks screen: every approval task assigned to the signed-in user (every user's, for a
 * System Administrator), with the correspondence it belongs to.
 */

/** ToDo — the user can act now; Waiting — an earlier step is still open; Completed — decided;
 * Cancelled — the chain was rejected before this task was reached. */
export type ApprovalInboxState = 'ToDo' | 'Waiting' | 'Completed' | 'Cancelled';

export interface IApprovalCorrespondenceSummary {
  id: string;
  subject: string;
  referenceNumber?: string;
  dueDate?: string;
  priority?: CorrespondencePriority;
  securityTier?: number;
  status?: CorrespondenceStatus;
  senderName?: string;
}

/** Whose tasks to load: everyone's, or the user's own (matched by email, or department for a team task). */
export interface IApprovalInboxScope {
  allUsers: boolean;
  email?: string;
  name?: string;
  department?: string;
}

/** The raw rows: every task of each involved correspondence (so its chain can be evaluated) plus
 * those correspondences' summaries. */
export interface IApprovalInboxSource {
  tasks: IApprovalTask[];
  correspondences: IApprovalCorrespondenceSummary[];
}

export interface IApprovalInboxItem {
  task: IApprovalTask;
  /** Every task of the same correspondence, for the chain's progress. */
  chainTasks: IApprovalTask[];
  correspondence: IApprovalCorrespondenceSummary;
  state: ApprovalInboxState;
  isOverdue: boolean;
}

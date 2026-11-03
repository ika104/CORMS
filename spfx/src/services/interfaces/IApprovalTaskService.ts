import { IApprovalChainStep } from '../../models/IApprovalChain';
import { IApprovalInboxScope, IApprovalInboxSource } from '../../models/IApprovalInbox';
import {
  IApprovalDecisionInput,
  IApprovalSignatureCompletionInput,
  IApprovalSignatureInput,
  IApprovalTask,
} from '../../models/IApprovalTask';

/**
 * CMS-006 — the SharePoint Task-based approval routing store (list CORMS_ApprovalTasks). Tasks are
 * created when a draft is routed (AC9) and are the single source of truth for approval status;
 * reviewers act on them from the correspondence detail screen (AC10/AC11). No Power Automate is
 * involved in creating or deciding tasks — only the later outcome email (AC13) is.
 */
export interface IApprovalTaskService {
  /** Every approval task for a correspondence, in step order. */
  getTasks(correspondenceId: string): Promise<IApprovalTask[]>;
  /** The Approval Tasks screen's rows: the scope's tasks with every task of their correspondences
   * (to evaluate each chain) and those correspondences' summaries. */
  getInbox(scope: IApprovalInboxScope): Promise<IApprovalInboxSource>;
  /** AC9 — creates one Task per participant from the routed chain (Reviewer → 1, Group → one per
   * member, Department → one team task), after any tasks the correspondence already has, so a
   * requestor can add steps later. Returns the correspondence's full task list. */
  createTasksForChain(
    correspondenceId: string,
    referenceNo: string | undefined,
    chain: IApprovalChainStep[]
  ): Promise<IApprovalTask[]>;
  /** Swaps the positions of two approval steps nobody has acted on yet (see approvalReorder.ts),
   * rejecting the swap otherwise. Returns the correspondence's full task list. */
  swapSteps(correspondenceId: string, stepOrder: number, otherStepOrder: number): Promise<IApprovalTask[]>;
  /** Persists the external signing document ID. This does not unlock approval. */
  recordSignature(input: IApprovalSignatureInput): Promise<IApprovalTask[]>;
  /** Persists flow-verified completion of the required signature. */
  recordSignatureCompletion(input: IApprovalSignatureCompletionInput): Promise<IApprovalTask[]>;
  /** AC10/AC11/AC12 — records a reviewer's Approve/Reject/Return on their task (timestamped and
   * attributed). Returns the correspondence's full task list after the update. */
  decide(input: IApprovalDecisionInput): Promise<IApprovalTask[]>;
}

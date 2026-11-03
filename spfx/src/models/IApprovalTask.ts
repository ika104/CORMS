import { ApprovalStepType, ISignaturePlacement } from './IApprovalChain';

/**
 * CMS-006 — a SharePoint Task item (list CORMS_ApprovalTasks) created for one approval participant
 * when a draft is routed. The Task item is the single source of truth for that participant's
 * approval status (AC9); reviewers act on it from the correspondence detail screen (AC10/AC11) and
 * each action is timestamped, attributed and audited (AC12). Email notification of the outcome
 * (AC13) is a later Power Automate step, not modelled here.
 */

/** 'Cancelled' is set on every task still pending when the chain is rejected: nobody acts on it. */
export type ApprovalTaskStatus = 'Pending' | 'Approved' | 'Rejected' | 'Returned' | 'Cancelled';
export type ApprovalDecision = 'Approved' | 'Rejected' | 'Returned';
export type ApprovalMode = 'Any' | 'All';

export interface IApprovalTask {
  id: string;
  correspondenceId: string;
  referenceNo?: string;
  /** 1-based execution order of the step this task belongs to (AC4). */
  stepOrder: number;
  stepType: ApprovalStepType;
  /** Display name of the reviewer / department / group the step targets. */
  stepName: string;
  /** AC14 — how the step completes: 'Any' (one participant) or 'All' (every participant). A single
   * Reviewer step is always 'All' of its one task. */
  mode: ApprovalMode;
  /** The participant this task is assigned to — a login/claims key or user id. Empty for a
   * Department step, which targets a whole unit (assignedToTeam) rather than a named person. */
  assignedToId?: string;
  assignedToName?: string;
  /** Set for a Department step — the department the task is addressed to. */
  assignedToTeam?: string;
  /** CMS-048 — rank of this participant within its Department step, ascending: 1 signs first
   * (most junior), then up the seniority ladder. Only a Department step's member tasks carry it;
   * it drives the sequential "one member holds the item at a time" progression. */
  seniority?: number;
  requireSignature: boolean;
  signaturePlacement?: ISignaturePlacement;
  /** Opaque external signing document ID created for this approval before it can be approved. */
  signatureExternalDocumentId?: string;
  /** ISO timestamp of the successful signing-flow handoff for this approval task. */
  signatureRequestedAt?: string;
  /** The reviewer whose signing request satisfied this approval prerequisite. */
  signatureRequestedBy?: string;
  /** ISO timestamp recorded only after the status flow reports this document as completed. */
  signatureCompletedAt?: string;
  /** Reviewer whose completed signature was verified by the broker. */
  signatureCompletedBy?: string;
  status: ApprovalTaskStatus;
  /** The reviewer's comment on their decision — required for a Return (AC11), optional otherwise. */
  decisionComment?: string;
  decidedBy?: string;
  /** ISO timestamp of the decision (AC12). */
  decidedAt?: string;
}

/** A reviewer's action on their task (AC10/AC11). */
export interface IApprovalDecisionInput {
  taskId: string;
  outcome: ApprovalDecision;
  comment?: string;
  decidedBy: string;
  decidedAt: string;
}

/** Records an external signing request. This alone does not unlock an approval. */
export interface IApprovalSignatureInput {
  taskId: string;
  externalDocumentId: string;
  requestedBy: string;
  requestedAt: string;
  /** The box actually sent for signing, when it had to move clear of an earlier signer. */
  signaturePlacement?: ISignaturePlacement;
}

/** Records a broker-confirmed completed signature, which unlocks the approval decision. */
export interface IApprovalSignatureCompletionInput {
  taskId: string;
  completedBy: string;
  completedAt: string;
}

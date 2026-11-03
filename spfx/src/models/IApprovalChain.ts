/**
 * CMS-006 — the serialised approval-chain contract carried on the Create Correspondence payload
 * and consumed by the SharePoint Task workflow (orchestrated by Power Automate) to create one Task
 * per participant (AC9) and run the steps in their built order (AC4). Kept in models (not the
 * createCorrespondence module) so the payload can reference it without a module→model inversion.
 */

export type ApprovalStepType = 'Reviewer' | 'Department' | 'Group';

/** AC16 — the signing-stamp position/page, as percentages of the page canvas. */
export interface ISignaturePlacement {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IApprovalChainParticipant {
  id: string;
  name: string;
}

/** One serialised step of the routed chain. */
export interface IApprovalChainStep {
  /** 1-based execution order — the order of the steps is the order of execution (AC4). */
  order: number;
  type: ApprovalStepType;
  /** Display name of the reviewer / department / group. */
  name: string;
  /** AC14 — Any/All completion mode for Department/Group steps; omitted for a single Reviewer. */
  mode?: 'Any' | 'All';
  /** AC7 — whether this step requires a digital signature. */
  requireSignature: boolean;
  /** AC16 — the chosen signing-stamp position/page; present only when requireSignature is true. */
  signaturePlacement?: ISignaturePlacement;
  /** AC9 — the named participants the workflow raises a Task for. A Reviewer has exactly one; a
   * Group carries its selected members. A Department resolves its members at runtime up the
   * seniority ladder (AC14), so this is empty and `departmentId` names the unit to resolve. */
  participants: IApprovalChainParticipant[];
  /** Set for a Department step so the workflow can resolve its members (empty participants). */
  departmentId?: string;
  /** CMS-048 — the Department step's members in ascending seniority order (index 0 = most junior,
   * signs first). When present, the workflow dispatches to them sequentially up the ladder; when
   * absent the step is a single team task (a member list is resolved at dispatch time). */
  members?: IApprovalChainParticipant[];
}

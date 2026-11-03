import { IApprovalChainStep } from '../../models/IApprovalChain';
import { IApprovalTask } from '../../models/IApprovalTask';

/** The task fields derived purely from the chain — everything except the persisted id and the
 * mutable decision fields (status defaults to Pending, no decision yet). */
export type IApprovalTaskDraft = Omit<IApprovalTask, 'id' | 'status' | 'decisionComment' | 'decidedBy' | 'decidedAt'>;

/**
 * CMS-006 AC9 — expands a routed chain into one task draft per participant: a Reviewer step yields
 * a single task assigned to that person; a Group step yields one task per selected member; a
 * Department step yields one task addressed to the unit (no named assignee — resolved by whoever
 * stands in for the department). Signature placement rides along only on signature-enabled steps
 * (AC7/AC16). Pure and id-free so both the mock and the live SharePoint writer share the mapping.
 */
export function expandChainToTaskDrafts(
  correspondenceId: string,
  referenceNo: string | undefined,
  chain: IApprovalChainStep[]
): IApprovalTaskDraft[] {
  const drafts: IApprovalTaskDraft[] = [];
  for (const step of chain) {
    const common = {
      correspondenceId,
      referenceNo,
      stepOrder: step.order,
      stepType: step.type,
      stepName: step.name,
      mode: step.mode ?? 'All',
      requireSignature: step.requireSignature,
      ...(step.requireSignature && step.signaturePlacement ? { signaturePlacement: step.signaturePlacement } : {}),
    };
    if (step.type === 'Department') {
      // CMS-048 — when the Department step carries an ordered member list, expand it into one task
      // per member with ascending seniority (index 0 = most junior, signs first) so the item can be
      // dispatched sequentially up the ladder. Without members it stays a single team task.
      if (step.members && step.members.length > 0) {
        step.members.forEach((m, i) =>
          drafts.push({ ...common, assignedToId: m.id, assignedToName: m.name, assignedToTeam: step.name, seniority: i + 1 })
        );
      } else {
        drafts.push({ ...common, assignedToTeam: step.name });
      }
    } else if (step.participants.length > 0) {
      step.participants.forEach((p) => drafts.push({ ...common, assignedToId: p.id, assignedToName: p.name }));
    } else {
      // A Reviewer/Group step with no resolved participants still needs a task so the step exists
      // in the chain (defensive — the builder always supplies at least one).
      drafts.push({ ...common });
    }
  }
  return drafts;
}

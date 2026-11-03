import { ISignaturePlacement } from '../../models/IApprovalChain';
import { IApprovalTask } from '../../models/IApprovalTask';
import { findFreePlacement } from '../../utils/signaturePlacement';

/**
 * Where this task's signature goes on the shared document: its planned box, moved to the nearest
 * free slot when an earlier signer already used that spot — e.g. the members of an "All" group,
 * who share their step's box. Undefined when the task has no planned box (the flow's default).
 */
export function resolveSigningPlacement(
  task: IApprovalTask,
  tasks: IApprovalTask[]
): ISignaturePlacement | undefined {
  if (!task.signaturePlacement) return undefined;
  const taken = tasks
    .filter(
      (other) =>
        other.id !== task.id &&
        other.status !== 'Cancelled' &&
        !!other.signaturePlacement &&
        (!!other.signatureExternalDocumentId || !!other.signatureCompletedAt)
    )
    .map((other) => other.signaturePlacement!);
  return findFreePlacement(task.signaturePlacement, taken);
}

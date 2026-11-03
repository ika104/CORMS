import { IApprovalTask } from '../../models/IApprovalTask';

export type StepMoveDirection = 'up' | 'down';

/** A step nobody has acted on yet: every task is still Pending and no signing has started. */
export function isStepUntouched(tasks: IApprovalTask[], stepOrder: number): boolean {
  const stepTasks = tasks.filter((task) => task.stepOrder === stepOrder);
  return (
    stepTasks.length > 0 &&
    stepTasks.every(
      (task) => task.status === 'Pending' && !task.signatureExternalDocumentId && !task.signatureCompletedAt
    )
  );
}

/**
 * The step a pending step swaps with when moved, or undefined when the move isn't allowed. Only two
 * neighbouring untouched steps swap, so decided or in-progress steps never change position.
 */
export function reorderTarget(
  tasks: IApprovalTask[],
  stepOrder: number,
  direction: StepMoveDirection
): number | undefined {
  const orders = Array.from(new Set(tasks.map((task) => task.stepOrder))).sort((a, b) => a - b);
  const index = orders.indexOf(stepOrder);
  const neighbour = orders[direction === 'up' ? index - 1 : index + 1];
  if (index === -1 || neighbour === undefined) return undefined;
  return isStepUntouched(tasks, stepOrder) && isStepUntouched(tasks, neighbour) ? neighbour : undefined;
}

/** Validates a swap requested by a caller; throws when either step has already been acted on. */
export function assertStepsSwappable(
  tasks: IApprovalTask[],
  stepOrder: number,
  otherStepOrder: number
): void {
  if (!isStepUntouched(tasks, stepOrder) || !isStepUntouched(tasks, otherStepOrder)) {
    throw new Error('Only approval steps nobody has acted on yet can be reordered.');
  }
}

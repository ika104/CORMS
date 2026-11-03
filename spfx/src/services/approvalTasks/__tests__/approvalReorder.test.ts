import { IApprovalTask } from '../../../models/IApprovalTask';
import { assertStepsSwappable, isStepUntouched, reorderTarget } from '../approvalReorder';

function task(id: string, stepOrder: number, overrides: Partial<IApprovalTask> = {}): IApprovalTask {
  return {
    id,
    correspondenceId: 'c-1',
    stepOrder,
    stepType: 'Reviewer',
    stepName: `Step ${stepOrder}`,
    mode: 'All',
    requireSignature: false,
    status: 'Pending',
    ...overrides,
  } as IApprovalTask;
}

describe('approval step reordering', () => {
  // Step 1 approved, step 2 has one of two members approved, steps 3 and 4 untouched.
  const tasks = [
    task('a', 1, { status: 'Approved' }),
    task('b', 2, { status: 'Approved' }),
    task('c', 2),
    task('d', 3),
    task('e', 4),
  ];

  it('treats a step as untouched only while every task is pending and unsigned', () => {
    expect(isStepUntouched(tasks, 1)).toBe(false);
    expect(isStepUntouched(tasks, 2)).toBe(false);
    expect(isStepUntouched(tasks, 3)).toBe(true);
    expect(isStepUntouched([task('s', 5, { signatureExternalDocumentId: 'ext-1' })], 5)).toBe(false);
  });

  it('swaps only neighbouring untouched steps', () => {
    expect(reorderTarget(tasks, 3, 'down')).toBe(4);
    expect(reorderTarget(tasks, 4, 'up')).toBe(3);
    // Nothing moves past a step someone has already acted on, and the ends stay put.
    expect(reorderTarget(tasks, 3, 'up')).toBeUndefined();
    expect(reorderTarget(tasks, 2, 'down')).toBeUndefined();
    expect(reorderTarget(tasks, 4, 'down')).toBeUndefined();
  });

  it('rejects a swap involving a step that has been acted on', () => {
    expect(() => assertStepsSwappable(tasks, 2, 3)).toThrow();
    expect(() => assertStepsSwappable(tasks, 3, 4)).not.toThrow();
  });
});

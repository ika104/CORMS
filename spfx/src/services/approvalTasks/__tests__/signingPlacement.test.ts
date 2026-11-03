import { IApprovalTask } from '../../../models/IApprovalTask';
import { resolveSigningPlacement } from '../signingPlacement';

const BOX = { page: 1, x: 70, y: 85, width: 20, height: 8 };

function task(id: string, overrides: Partial<IApprovalTask> = {}): IApprovalTask {
  return {
    id,
    correspondenceId: 'c-1',
    stepOrder: 1,
    stepType: 'Group',
    stepName: 'Board',
    mode: 'All',
    requireSignature: true,
    signaturePlacement: BOX,
    status: 'Pending',
    ...overrides,
  };
}

describe('resolveSigningPlacement', () => {
  it('keeps the planned box while nobody has signed there', () => {
    expect(resolveSigningPlacement(task('a'), [task('a'), task('b')])).toEqual(BOX);
  });

  it('moves a member of an "All" group clear of the member who already signed that box', () => {
    const tasks = [task('a', { status: 'Approved', signatureCompletedAt: '2026-09-25' }), task('b')];
    expect(resolveSigningPlacement(tasks[1], tasks)).toEqual({ ...BOX, x: 40 });
  });

  it('is undefined when the task has no planned box', () => {
    expect(resolveSigningPlacement(task('a', { signaturePlacement: undefined }), [])).toBeUndefined();
  });
});

import {
  evaluateChainProgress,
  evaluateStepStatus,
  findActionableTask,
  isTaskCancelled,
} from '../approvalProgress';
import { IApprovalTask } from '../../../models/IApprovalTask';

function task(overrides: Partial<IApprovalTask>): IApprovalTask {
  return {
    id: overrides.id ?? 't',
    correspondenceId: 'c1',
    stepOrder: 1,
    stepType: 'Reviewer',
    stepName: 'Step',
    mode: 'All',
    requireSignature: false,
    status: 'Pending',
    ...overrides,
  };
}

describe('CMS-006 AC14 — evaluateStepStatus', () => {
  it('Any completes on a single approval', () => {
    expect(
      evaluateStepStatus([
        task({ mode: 'Any', status: 'Approved' }),
        task({ mode: 'Any', status: 'Pending' }),
      ])
    ).toBe('Approved');
  });

  it('All needs every task approved', () => {
    expect(
      evaluateStepStatus([
        task({ mode: 'All', status: 'Approved' }),
        task({ mode: 'All', status: 'Pending' }),
      ])
    ).toBe('Pending');
    expect(
      evaluateStepStatus([
        task({ mode: 'All', status: 'Approved' }),
        task({ mode: 'All', status: 'Approved' }),
      ])
    ).toBe('Approved');
  });

  it('a reject or return by any participant halts the step regardless of mode', () => {
    expect(
      evaluateStepStatus([
        task({ mode: 'Any', status: 'Approved' }),
        task({ mode: 'Any', status: 'Rejected' }),
      ])
    ).toBe('Rejected');
    expect(evaluateStepStatus([task({ mode: 'All', status: 'Returned' })])).toBe('Returned');
  });
});

describe('CMS-006 AC4/AC12 — evaluateChainProgress', () => {
  it('marks the first unapproved step active and reports InReview', () => {
    const tasks = [
      task({ id: 'a', stepOrder: 1, status: 'Approved' }),
      task({ id: 'b', stepOrder: 2, status: 'Pending' }),
    ];
    const progress = evaluateChainProgress(tasks);
    expect(progress.activeStepOrder).toBe(2);
    expect(progress.outcome).toBe('InProgress');
    expect(progress.correspondenceStatus).toBe('InReview');
    expect(progress.steps.find((s) => s.stepOrder === 1)!.status).toBe('Approved');
  });

  it('reports Approved with correspondence status Approved once every step approves', () => {
    const progress = evaluateChainProgress([
      task({ id: 'a', stepOrder: 1, status: 'Approved' }),
      task({ id: 'b', stepOrder: 2, status: 'Approved' }),
    ]);
    expect(progress.outcome).toBe('Approved');
    expect(progress.activeStepOrder).toBeUndefined();
    expect(progress.correspondenceStatus).toBe('Approved');
  });

  it('a rejection marks the correspondence Rejected and stops at that step', () => {
    const progress = evaluateChainProgress([
      task({ id: 'a', stepOrder: 1, status: 'Approved' }),
      task({ id: 'b', stepOrder: 2, status: 'Rejected' }),
    ]);
    expect(progress.outcome).toBe('Rejected');
    expect(progress.activeStepOrder).toBe(2);
    expect(progress.correspondenceStatus).toBe('Rejected');
  });

  it('a return sends the correspondence back to Draft for the originator to rework', () => {
    const progress = evaluateChainProgress([task({ id: 'a', stepOrder: 1, status: 'Returned' })]);
    expect(progress.correspondenceStatus).toBe('Draft');
  });
});

describe('CMS-006 AC10 — findActionableTask', () => {
  const tasks = [
    task({ id: 'a', stepOrder: 1, status: 'Approved', assignedToId: 'u-1' }),
    task({ id: 'b', stepOrder: 2, status: 'Pending', assignedToId: 'u-2' }),
    task({
      id: 'c',
      stepOrder: 2,
      status: 'Pending',
      stepType: 'Department',
      assignedToId: undefined,
      assignedToTeam: 'Legal',
    }),
  ];
  const progress = evaluateChainProgress(tasks);

  it('returns the active-step pending task assigned to the current user', () => {
    expect(findActionableTask(tasks, progress, 'u-2')?.id).toBe('b');
  });

  it('returns a department task (no assignee) for any viewer', () => {
    expect(findActionableTask(tasks, progress, 'someone-else')?.id).toBe('c');
  });

  it('returns nothing once the chain is fully approved', () => {
    const done = [task({ id: 'a', stepOrder: 1, status: 'Approved' })];
    expect(findActionableTask(done, evaluateChainProgress(done), 'u-1')).toBeUndefined();
  });
});

describe('a rejected step cancels the rest of the chain', () => {
  const tasks = [
    task({ id: 'a', stepOrder: 1, status: 'Approved' }),
    task({ id: 'b', stepOrder: 2, mode: 'Any', status: 'Rejected' }),
    task({ id: 'c', stepOrder: 2, mode: 'Any' }),
    task({ id: 'd', stepOrder: 3 }),
    task({ id: 'e', stepOrder: 4 }),
  ];

  it('marks every later step Cancelled', () => {
    const progress = evaluateChainProgress(tasks);
    expect(progress.steps.map((s) => s.status)).toEqual(['Approved', 'Rejected', 'Cancelled', 'Cancelled']);
    expect(progress.outcome).toBe('Rejected');
  });

  it('cancels the pending tasks in and after the rejected step, but not decided ones', () => {
    const progress = evaluateChainProgress(tasks);
    expect(tasks.filter((t) => isTaskCancelled(t, progress)).map((t) => t.id)).toEqual(['c', 'd', 'e']);
  });

  it('reads stored Cancelled tasks as cancelled and keeps the rejected step Rejected', () => {
    const stored = [
      task({ id: 'r', stepOrder: 1, mode: 'Any', status: 'Rejected' }),
      task({ id: 'c1', stepOrder: 1, mode: 'Any', status: 'Cancelled' }),
      task({ id: 'c2', stepOrder: 2, status: 'Cancelled' }),
    ];
    const progress = evaluateChainProgress(stored);
    expect(progress.steps.map((s) => s.status)).toEqual(['Rejected', 'Cancelled']);
    expect(stored.filter((t) => isTaskCancelled(t, progress)).map((t) => t.id)).toEqual(['c1', 'c2']);
  });

  it('leaves later steps pending while the chain is still in progress', () => {
    const progress = evaluateChainProgress([
      task({ id: 'x', stepOrder: 1 }),
      task({ id: 'y', stepOrder: 2 }),
    ]);
    expect(progress.steps.map((s) => s.status)).toEqual(['Pending', 'Pending']);
    expect(isTaskCancelled(task({ id: 'y', stepOrder: 2 }), progress)).toBe(false);
  });
});

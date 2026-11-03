import {
  activeAssigneeTaskIds,
  canSign,
  evaluateSignAttempt,
  isActiveAssignee,
  isStepComplete,
  releasedTaskIds,
} from '../signatureHierarchy';
import { ApprovalMode, ApprovalTaskStatus, IApprovalTask } from '../../../models/IApprovalTask';
import { ApprovalStepType } from '../../../models/IApprovalChain';

function task(
  id: string,
  overrides: Partial<IApprovalTask> & { type?: ApprovalStepType; mode?: ApprovalMode; status?: ApprovalTaskStatus } = {}
): IApprovalTask {
  return {
    id,
    correspondenceId: 'c1',
    stepOrder: 1,
    stepType: overrides.type ?? 'Department',
    stepName: 'Finance',
    mode: overrides.mode ?? 'All',
    requireSignature: true,
    status: overrides.status ?? 'Pending',
    assignedToId: overrides.assignedToId,
    seniority: overrides.seniority,
    ...overrides,
  };
}

// A Department 'All' step, three members ascending seniority (1 = most junior signs first).
function deptAll(...statuses: ApprovalTaskStatus[]): IApprovalTask[] {
  return statuses.map((status, i) => task(`m${i + 1}`, { type: 'Department', mode: 'All', seniority: i + 1, status, assignedToId: `u${i + 1}` }));
}

describe('CMS-048 AC1/AC2 — Department (All) sequential up the seniority ladder', () => {
  it('only the most-junior unsigned member is active; it advances as each signs', () => {
    let tasks = deptAll('Pending', 'Pending', 'Pending');
    expect(activeAssigneeTaskIds(tasks)).toEqual(['m1']); // junior first

    tasks = deptAll('Approved', 'Pending', 'Pending');
    expect(activeAssigneeTaskIds(tasks)).toEqual(['m2']); // advanced up

    tasks = deptAll('Approved', 'Approved', 'Pending');
    expect(activeAssigneeTaskIds(tasks)).toEqual(['m3']);
  });

  it('AC3 — completes only when every member has signed', () => {
    expect(isStepComplete(deptAll('Approved', 'Approved', 'Pending'))).toBe(false);
    expect(isStepComplete(deptAll('Approved', 'Approved', 'Approved'))).toBe(true);
    expect(activeAssigneeTaskIds(deptAll('Approved', 'Approved', 'Approved'))).toEqual([]);
  });

  it('AC7/AC2 — a senior member cannot sign while a junior still holds the item', () => {
    const tasks = deptAll('Pending', 'Pending', 'Pending');
    expect(isActiveAssignee(tasks, 'm1')).toBe(true);
    expect(isActiveAssignee(tasks, 'm2')).toBe(false);
    expect(evaluateSignAttempt(tasks, 'm2', 'u2')).toEqual({ ok: false, reason: 'not-active' });
  });
});

describe('CMS-048 AC2 — Department (Any): any one member is enough', () => {
  const anyTasks = (): IApprovalTask[] => [
    task('m1', { type: 'Department', mode: 'Any', seniority: 1, status: 'Pending', assignedToId: 'u1' }),
    task('m2', { type: 'Department', mode: 'Any', seniority: 2, status: 'Pending', assignedToId: 'u2' }),
  ];

  it('every pending member is active (not one-at-a-time)', () => {
    expect(activeAssigneeTaskIds(anyTasks()).sort()).toEqual(['m1', 'm2']);
  });

  it('completes on the first signature', () => {
    const signed = anyTasks();
    signed[1] = { ...signed[1], status: 'Approved' };
    expect(isStepComplete(signed)).toBe(true);
    expect(activeAssigneeTaskIds(signed)).toEqual([]);
  });
});

describe('CMS-048 AC4/AC5 — Group parallel dispatch', () => {
  const group = (mode: ApprovalMode, ...statuses: ApprovalTaskStatus[]): IApprovalTask[] =>
    statuses.map((status, i) => task(`g${i + 1}`, { type: 'Group', mode, status, assignedToId: `u${i + 1}` }));

  it('AC4 grouping enabled (Any): first signature completes it and the rest are released', () => {
    const tasks = group('Any', 'Approved', 'Pending', 'Pending');
    expect(isStepComplete(tasks)).toBe(true);
    expect(releasedTaskIds(tasks).sort()).toEqual(['g2', 'g3']);
    expect(activeAssigneeTaskIds(tasks)).toEqual([]);
    // AC7 — a released member can no longer sign.
    expect(canSign(tasks, 'g2', 'u2')).toBe(false);
    expect(evaluateSignAttempt(tasks, 'g2', 'u2')).toEqual({ ok: false, reason: 'step-complete' });
  });

  it('AC5 no grouping (All): all dispatched at once, completes only when all sign', () => {
    expect(activeAssigneeTaskIds(group('All', 'Pending', 'Pending')).sort()).toEqual(['g1', 'g2']);
    expect(isStepComplete(group('All', 'Approved', 'Pending'))).toBe(false);
    expect(isStepComplete(group('All', 'Approved', 'Approved'))).toBe(true);
  });
});

describe('CMS-048 AC6/AC7 — evaluateSignAttempt gates', () => {
  const tasks = deptAll('Pending', 'Pending');

  it('AC6 — a repeat sign on an already-signed task is an idempotent no-op', () => {
    const signed = deptAll('Approved', 'Pending');
    expect(evaluateSignAttempt(signed, 'm1', 'u1')).toEqual({ ok: false, reason: 'already-signed' });
    expect(canSign(signed, 'm1', 'u1')).toBe(false);
  });

  it('AC7 — the wrong user cannot sign an active task', () => {
    expect(evaluateSignAttempt(tasks, 'm1', 'someone-else')).toEqual({ ok: false, reason: 'wrong-user' });
  });

  it('unknown task id is rejected', () => {
    expect(evaluateSignAttempt(tasks, 'nope', 'u1')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('the active junior member with the right identity may sign', () => {
    const result = evaluateSignAttempt(tasks, 'm1', 'u1');
    expect(result.ok).toBe(true);
  });
});

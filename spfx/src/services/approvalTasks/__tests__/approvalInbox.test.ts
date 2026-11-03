import { IApprovalTask } from '../../../models/IApprovalTask';
import { IApprovalInboxSource } from '../../../models/IApprovalInbox';
import { buildApprovalInbox } from '../approvalInbox';
import { isAssignedTo } from '../approvalActor';

const LAYLA = 'i:0#.f|membership|layla@example.com';
const OMAR = 'i:0#.f|membership|omar@example.com';

function task(id: string, overrides: Partial<IApprovalTask>): IApprovalTask {
  return {
    id,
    correspondenceId: 'c-1',
    stepOrder: 1,
    stepType: 'Reviewer',
    stepName: 'Step',
    mode: 'All',
    requireSignature: false,
    status: 'Pending',
    ...overrides,
  };
}

const source: IApprovalInboxSource = {
  tasks: [
    task('a', { stepOrder: 1, assignedToId: LAYLA, assignedToName: 'Layla Hassan' }),
    task('b', { stepOrder: 2, assignedToId: OMAR, assignedToName: 'Omar Said' }),
    task('c', { stepOrder: 3, stepType: 'Department', assignedToTeam: 'Finance' }),
  ],
  correspondences: [{ id: 'c-1', subject: 'Budget memo', referenceNumber: 'REF-1', dueDate: '2026-01-01' }],
};

describe('isAssignedTo', () => {
  it("matches the email in the assignee key, or a team task for the user's department", () => {
    expect(isAssignedTo(source.tasks[0], { email: 'Layla@example.com' })).toBe(true);
    expect(isAssignedTo(source.tasks[0], { email: 'omar@example.com' })).toBe(false);
    expect(isAssignedTo(source.tasks[2], { department: 'finance' })).toBe(true);
    expect(isAssignedTo(source.tasks[2], { department: 'Legal' })).toBe(false);
  });
});

describe('buildApprovalInbox', () => {
  const now = new Date('2026-09-25T10:00:00Z');

  it('shows a user only their own tasks, with whether it is their turn yet', () => {
    const layla = buildApprovalInbox(source, { allUsers: false, email: 'layla@example.com' }, now);
    expect(layla.map((item) => [item.task.id, item.state])).toEqual([['a', 'ToDo']]);
    expect(layla[0].correspondence.subject).toBe('Budget memo');
    expect(layla[0].chainTasks).toHaveLength(3);

    const omar = buildApprovalInbox(source, { allUsers: false, email: 'omar@example.com' }, now);
    expect(omar.map((item) => [item.task.id, item.state])).toEqual([['b', 'Waiting']]);
  });

  it('shows a System Administrator every task', () => {
    expect(buildApprovalInbox(source, { allUsers: true }, now).map((item) => item.task.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('flags open tasks past the correspondence due date', () => {
    const items = buildApprovalInbox(source, { allUsers: true }, now);
    expect(items.every((item) => item.isOverdue)).toBe(true);
  });

  it('marks decided tasks Completed and the rest of a rejected chain Cancelled', () => {
    const rejected: IApprovalInboxSource = {
      ...source,
      tasks: [{ ...source.tasks[0], status: 'Rejected' }, source.tasks[1], source.tasks[2]],
    };
    const items = buildApprovalInbox(rejected, { allUsers: true }, now);
    expect(items.map((item) => item.state)).toEqual(['Completed', 'Cancelled', 'Cancelled']);
    expect(items.some((item) => item.isOverdue)).toBe(false);
  });
});

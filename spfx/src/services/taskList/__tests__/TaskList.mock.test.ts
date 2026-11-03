import { applyTaskFilters } from '../TaskList.mock';
import { ITask } from '../../../models/ITask';

function task(overrides: Partial<ITask>): ITask {
  return {
    id: '1',
    subject: 'Sample',
    type: 'To Do',
    priority: 'Normal',
    status: 'Pending',
    dueDate: '2026-06-01',
    assignee: 'Zeyad El Maghraby',
    assignees: [{ displayName: 'Zeyad El Maghraby' }],
    hasAttachment: false,
    isMine: false,
    isOverdue: false,
    referenceNo: 'TSK-1',
    ...overrides,
  };
}

describe('Part 4 — TaskListServiceMock filtering (mock dataset unchanged, same filter dimensions as the live service)', () => {
  it('freeText matches subject or referenceNo, case-insensitively', () => {
    const items = [
      task({ subject: 'Budget approval' }),
      task({ subject: 'Unrelated', referenceNo: 'BUDGET-77' }),
      task({ subject: 'Other' }),
    ];

    expect(applyTaskFilters(items, { freeText: 'budget' })).toHaveLength(2);
  });

  it('type/priority/assignee filter in isolation', () => {
    const items = [
      task({ type: 'Reminder', priority: 'High', assignee: 'Layla Hassan' }),
      task({ type: 'To Do', priority: 'Low', assignee: 'Ali Al-Rashid' }),
    ];

    expect(applyTaskFilters(items, { type: 'Reminder' })).toHaveLength(1);
    expect(applyTaskFilters(items, { priority: 'High' })).toHaveLength(1);
    expect(applyTaskFilters(items, { assignee: 'Layla' })).toHaveLength(1);
  });

  it('status filter "Overdue" matches the precomputed isOverdue flag, not a literal status equality', () => {
    const items = [
      task({ status: 'Pending', isOverdue: true }),
      task({ status: 'Completed', isOverdue: false }),
    ];

    expect(applyTaskFilters(items, { status: 'Overdue' })).toHaveLength(1);
  });

  it('status filter with a literal value matches status directly', () => {
    const items = [task({ status: 'In Progress' }), task({ status: 'Pending' })];

    expect(applyTaskFilters(items, { status: 'In Progress' })).toHaveLength(1);
  });

  it('combined filters AND together', () => {
    const items = [
      task({ type: 'To Do', priority: 'High' }),
      task({ type: 'To Do', priority: 'Low' }),
      task({ type: 'Reminder', priority: 'High' }),
    ];

    expect(applyTaskFilters(items, { type: 'To Do', priority: 'High' })).toHaveLength(1);
  });

  it('with no filters, returns every item unchanged', () => {
    const items = [task({}), task({ id: '2' })];

    expect(applyTaskFilters(items, undefined)).toHaveLength(2);
  });
});

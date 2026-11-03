import { computeTaskDisplayStatus, mapTaskRowToStub } from '../mapTaskRow';

const TODAY = '2026-06-15T00:00:00.000Z';
const PAST = '2026-06-01T00:00:00.000Z';
const FUTURE = '2026-06-30T00:00:00.000Z';

describe('CMS-049 AC4 — computed-Overdue decision', () => {
  it('a Pending task past its due date computes as Overdue', () => {
    expect(computeTaskDisplayStatus('Pending', PAST, TODAY)).toBe('Overdue');
  });

  it('an In Progress task past its due date computes as Overdue', () => {
    expect(computeTaskDisplayStatus('In Progress', PAST, TODAY)).toBe('Overdue');
  });

  it('a task literally stored as Overdue but NOT yet past its due date does not compute as Overdue (computed state overrides the stored value in both directions)', () => {
    expect(computeTaskDisplayStatus('Overdue', FUTURE, TODAY)).toBe('Pending');
  });

  it('a Completed task past its due date is never flagged Overdue', () => {
    expect(computeTaskDisplayStatus('Completed', PAST, TODAY)).toBe('Completed');
  });

  it('a task with no due date at all is never flagged Overdue', () => {
    expect(computeTaskDisplayStatus('Pending', undefined, TODAY)).toBe('Pending');
  });

  it('a task due today (not yet past) is not flagged Overdue', () => {
    expect(computeTaskDisplayStatus('Pending', TODAY, TODAY)).toBe('Pending');
  });

  it('an unrecognized raw status defaults to Pending before applying the overdue check', () => {
    expect(computeTaskDisplayStatus('SomeFutureChoiceValue', FUTURE, TODAY)).toBe('Pending');
    expect(computeTaskDisplayStatus('SomeFutureChoiceValue', PAST, TODAY)).toBe('Overdue');
  });
});

describe('mapTaskRowToStub', () => {
  it('sets isMine from AssignedToUserId, isMyTeam from AssignedToTeam vs department, and isOverdue from the computed status', () => {
    const stub = mapTaskRowToStub(
      {
        Id: 7,
        Title: 'Test task',
        TaskType: 'Reminder',
        Priority: 'Low',
        Status: 'Pending',
        Created: '2026-06-10T09:00:00.000Z',
        DueDate: PAST,
        Attachments: true,
        AssignedToTeam: 'Finance',
        AssignedToUserId: 10,
        AssignedToUser: { Id: 10, Title: 'Jane Doe', EMail: 'jane.doe@example.com' },
        RelatedCorrespondenceId: '5',
        Description: 'desc',
        ReferenceNo: 'TSK-7',
      },
      10,
      'Finance',
      TODAY
    );

    expect(stub.id).toBe('7');
    expect(stub.status).toBe('Overdue');
    expect(stub.isOverdue).toBe(true);
    expect(stub.isMine).toBe(true);
    expect(stub.isMyTeam).toBe(true);
    expect(stub.assignee).toBe('Jane Doe');
    expect(stub.assignees).toEqual([{ id: 10, displayName: 'Jane Doe', email: 'jane.doe@example.com' }]);
    expect(stub.relatedCorrespondenceId).toBe('5');
    expect(stub.createdAt).toBe('2026-06-10T09:00:00.000Z');
    expect(stub.hasAttachment).toBe(true);
  });

  it('isMine/isMyTeam are false when the row belongs to a different user/team', () => {
    const stub = mapTaskRowToStub(
      { Id: 1, AssignedToTeam: 'Legal', AssignedToUserId: 999, DueDate: FUTURE, Status: 'Pending' },
      10,
      'Finance',
      TODAY
    );

    expect(stub.isMine).toBe(false);
    expect(stub.isMyTeam).toBe(false);
  });

  it('maps every AssignedToUser value and marks a task as mine when the current user is one of several assignees', () => {
    const stub = mapTaskRowToStub(
      {
        Id: 8,
        AssignedToUserId: [99, 10, 42],
        AssignedToUser: [
          { Id: 99, Title: 'Amal Hassan', EMail: 'amal@example.com' },
          { Id: 10, Title: 'Jane Doe', EMail: 'jane.doe@example.com' },
          { Id: 42, Title: 'Omar Ali', EMail: 'omar@example.com' },
        ],
        DueDate: FUTURE,
        Status: 'Pending',
      },
      10,
      undefined,
      TODAY
    );

    expect(stub.assignee).toBe('Amal Hassan, Jane Doe, Omar Ali');
    expect(stub.assignees).toHaveLength(3);
    expect(stub.assignees[1].email).toBe('jane.doe@example.com');
    expect(stub.isMine).toBe(true);
  });
});

import { mapElasticHitToTask, taskMatchesFilters } from '../elasticTaskQuery';
import { IElasticHit } from '../elasticQuery';
import { ITask } from '../../../models/ITask';

describe('mapElasticHitToTask — CORMS_Tasks per-site hit (CMS-046)', () => {
  it('maps item columns under fields.* to the ITask shape', () => {
    const hit: IElasticHit = {
      _id: 'listguid_7',
      _index: 'ssloman.sharepoint.com_corms_web',
      _source: {
        parentReference: { list: { name: 'CORMS_Tasks', displayName: 'Tasks' } },
        fields: {
          id: '7',
          Title: 'Review the budget memo',
          TaskType: 'Follow-up Task',
          Priority: 'High',
          Status: 'In Progress',
          DueDate: '2030-01-15T00:00:00Z',
          AssignedToTeam: 'Finance',
          AssignedToUser: 'Sara',
          ReferenceNo: 'TSK-2026-0007',
          RelatedCorrespondenceId: '42',
          Description: 'Follow up on Q4 numbers',
        },
      },
    };
    expect(mapElasticHitToTask(hit)).toEqual<ITask>({
      id: '7',
      subject: 'Review the budget memo',
      type: 'Follow-up Task',
      priority: 'High',
      status: 'In Progress',
      dueDate: '2030-01-15',
      assignee: 'Sara',
      assignees: [{ displayName: 'Sara' }],
      hasAttachment: false,
      isMine: false,
      isOverdue: false,
      referenceNo: 'TSK-2026-0007',
      team: 'Finance',
      relatedCorrespondenceId: '42',
      description: 'Follow up on Q4 numbers',
    });
  });

  it('computes Overdue from a past DueDate (never trusted verbatim), and defaults unknown enums', () => {
    const hit: IElasticHit = {
      _id: 'x_1',
      _source: { fields: { id: '1', Title: 'Old task', DueDate: '2000-01-01T00:00:00Z', Status: 'Pending' } },
    };
    const mapped = mapElasticHitToTask(hit);
    expect(mapped.status).toBe('Overdue');
    expect(mapped.isOverdue).toBe(true);
    expect(mapped.type).toBe('To Do'); // unknown/absent TaskType default
    expect(mapped.priority).toBe('Normal'); // unknown/absent Priority default
  });

  it('a Completed task past its due date is not flagged overdue', () => {
    const hit: IElasticHit = {
      _id: 'x_2',
      _source: { fields: { id: '2', Title: 'Done', DueDate: '2000-01-01T00:00:00Z', Status: 'Completed' } },
    };
    const mapped = mapElasticHitToTask(hit);
    expect(mapped.status).toBe('Completed');
    expect(mapped.isOverdue).toBe(false);
  });
});

describe('taskMatchesFilters (CMS-046 AC5)', () => {
  const base: ITask = {
    id: '1',
    subject: 'Task',
    type: 'To Do',
    priority: 'Normal',
    status: 'Pending',
    dueDate: '2030-01-01',
    assignee: 'Alice Johnson',
    assignees: [{ displayName: 'Alice Johnson' }],
    hasAttachment: false,
    isMine: false,
    isOverdue: false,
  };

  it('passes with no filters', () => {
    expect(taskMatchesFilters(base, {})).toBe(true);
  });
  it('filters by type, priority and status exactly', () => {
    expect(taskMatchesFilters(base, { type: 'Reminder' })).toBe(false);
    expect(taskMatchesFilters(base, { priority: 'Normal' })).toBe(true);
    expect(taskMatchesFilters(base, { status: 'Completed' })).toBe(false);
  });
  it('filters by assignee as a case-insensitive substring', () => {
    expect(taskMatchesFilters(base, { assignee: 'alice' })).toBe(true);
    expect(taskMatchesFilters(base, { assignee: 'bob' })).toBe(false);
  });
});

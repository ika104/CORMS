import { TaskListServiceCore } from '../TaskListServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const CURRENT_USER_ID = 10;
const CURRENT_USER_DEPARTMENT = 'Finance';

function futureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 10);
  return d.toISOString();
}

function pastDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 10);
  return d.toISOString();
}

function baseRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    Title: 'Sample task',
    TaskType: 'To Do',
    Priority: 'Normal',
    Status: 'Pending',
    DueDate: futureDate(),
    AssignedToTeam: 'IT',
    AssignedToUserId: 999,
    AssignedToUser: { Title: 'Someone Else' },
    RelatedCorrespondenceId: '',
    Description: '',
    ReferenceNo: 'TSK-1',
    ...overrides,
  };
}

function seedTasks(site: ReturnType<typeof createFakeSite>, rows: Array<Record<string, unknown>>): void {
  seedList(
    site,
    'CORMS_Tasks',
    rows.map((r, i) => ({ Id: i + 1, ...r }))
  );
}

function seedCurrentUserRole(
  site: ReturnType<typeof createFakeSite>,
  department = CURRENT_USER_DEPARTMENT
): void {
  seedList(site, 'CORMS_UserRoles', [
    { Id: 1, UserId: CURRENT_USER_ID, Role: 'Recipient', Department: department },
  ]);
}

function makeCore(site: ReturnType<typeof createFakeSite>): TaskListServiceCore {
  return new TaskListServiceCore(createFakeSp(site));
}

describe('CMS-049', () => {
  it('getAll: returns every row within the result set (no clearance trimming — CORMS_Tasks has no SecurityLevel field)', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({}), baseRow({ Title: 'Second' })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows).toHaveLength(2);
  });

  it('marks a task as attached when CORMS_Attachments has the same TaskReference', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ ReferenceNo: 'TSK-2026-0033' }),
      baseRow({ Title: 'File-name linked task', ReferenceNo: 'TSK-2026-0044' }),
    ]);
    seedList(site, 'CORMS_Attachments', [
      { Id: 1, TaskReference: 'TSK-2026-0033', FileName: 'correspondence-1.pdf' },
      { Id: 2, TaskReference: 'TSK-2026-9999', FileName: 'another-task.pdf' },
      { Id: 3, FileName: 'TSK-2026-0044_supporting-document.pdf' },
    ]);

    const rows = await makeCore(site).getAll();

    expect(rows[0].hasAttachment).toBe(true);
    expect(rows[1].hasAttachment).toBe(true);
  });

  it('AC4: a task with a stale stored Status past its due date computes as Overdue', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ Status: 'Pending', DueDate: pastDate() })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows[0].status).toBe('Overdue');
    expect(rows[0].isOverdue).toBe(true);
  });

  it('AC4: a Completed task past its due date does NOT compute as Overdue', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ Status: 'Completed', DueDate: pastDate() })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows[0].status).toBe('Completed');
    expect(rows[0].isOverdue).toBe(false);
  });

  it('a task not yet due keeps its stored (mapped) status', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ Status: 'In Progress', DueDate: futureDate() })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows[0].status).toBe('In Progress');
    expect(rows[0].isOverdue).toBe(false);
  });

  it('My Tasks tile source: isMine is true only for rows assigned to the current user', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ AssignedToUserId: CURRENT_USER_ID }), baseRow({ AssignedToUserId: 999 })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows[0].isMine).toBe(true);
    expect(rows[1].isMine).toBe(false);
  });

  it('reads every person from the multi-value AssignedToUser field and treats any matching person as the current user', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({
        AssignedToUserId: [999, CURRENT_USER_ID, 55],
        AssignedToUser: [
          { Id: 999, Title: 'Other Person', EMail: 'other@example.com' },
          { Id: CURRENT_USER_ID, Title: 'Current User', EMail: 'current@example.com' },
          { Id: 55, Title: 'Third Person', EMail: 'third@example.com' },
        ],
      }),
    ]);

    const [row] = await makeCore(site).getAll();

    expect(row.assignees.map((assignee) => assignee.email)).toEqual([
      'other@example.com',
      'current@example.com',
      'third@example.com',
    ]);
    expect(row.isMine).toBe(true);
  });

  it("Team Tasks tile source: isMyTeam is true only when AssignedToTeam matches the current user's CORMS_UserRoles.Department", async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site, 'Finance');
    seedTasks(site, [baseRow({ AssignedToTeam: 'Finance' }), baseRow({ AssignedToTeam: 'Legal' })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows[0].isMyTeam).toBe(true);
    expect(rows[1].isMyTeam).toBe(false);
  });

  it('free-text filter matches Subject or ReferenceNo', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ Title: 'Budget approval follow-up' }),
      baseRow({ Title: 'Unrelated', ReferenceNo: 'BUDGET-77' }),
      baseRow({ Title: 'Something else', ReferenceNo: 'TSK-2' }),
    ]);
    const core = makeCore(site);

    const rows = await core.getAll({ freeText: 'budget' });

    expect(rows).toHaveLength(2);
  });

  it('free-text filter is Arabic-aware normalized — a tatweel-decorated query still matches plain stored text', async () => {
    // normalizeForFilter is applied to the query term (embedded into the $filter clause), not to
    // the stored field value — SharePoint REST's substringof matches against the raw stored
    // string. This one-directional normalization mirrors the client-side grid's own
    // DEFAULT_TEXT_FILTER_PARAMS usage: it helps when the query carries decoration (tatweel,
    // diacritics, hamza variants) a cleanly-entered stored value doesn't.
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ Title: 'مهمة التقرير المالي' }), baseRow({ Title: 'Unrelated task' })]);
    const core = makeCore(site);

    const rows = await core.getAll({ freeText: 'التقـرير' });

    expect(rows).toHaveLength(1);
  });

  it('type filter constrains to the exact TaskType Choice value', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ TaskType: 'Reminder' }), baseRow({ TaskType: 'To Do' })]);
    const core = makeCore(site);

    const rows = await core.getAll({ type: 'Reminder' });

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('Reminder');
  });

  it('priority filter constrains to the exact Priority Choice value', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ Priority: 'High' }), baseRow({ Priority: 'Low' })]);
    const core = makeCore(site);

    const rows = await core.getAll({ priority: 'High' });

    expect(rows).toHaveLength(1);
    expect(rows[0].priority).toBe('High');
  });

  it('status filter "Overdue" uses the computed condition, not a literal Status match', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ Status: 'Pending', DueDate: pastDate() }), // computed Overdue
      baseRow({ Status: 'Completed', DueDate: pastDate() }), // Completed, excluded
      baseRow({ Status: 'Pending', DueDate: futureDate() }), // not due yet, excluded
    ]);
    const core = makeCore(site);

    const rows = await core.getAll({ status: 'Overdue' });

    expect(rows).toHaveLength(1);
  });

  it('status filter with a literal value (not Overdue) matches the stored Status directly', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ Status: 'In Progress', DueDate: futureDate() }),
      baseRow({ Status: 'Pending', DueDate: futureDate() }),
    ]);
    const core = makeCore(site);

    const rows = await core.getAll({ status: 'In Progress' });

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('In Progress');
  });

  // Matched client-side over the mapped rows, not as a $filter clause: AssignedToUser is a People
  // (Lookup-derived) field and SharePoint REST rejects substringof() on a projected lookup path.
  it("assignee filter matches the assignee's display name, contains-style", async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ AssignedToUser: { Title: 'Layla Hassan' } }),
      baseRow({ AssignedToUser: { Title: 'Ali Al-Rashid' } }),
    ]);
    const core = makeCore(site);

    const rows = await core.getAll({ assignee: 'Layla' });

    expect(rows).toHaveLength(1);
    expect(rows[0].assignee).toBe('Layla Hassan');
  });

  it('assignee filter is Arabic-aware normalized on both sides, exactly like the mock service', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ AssignedToUser: { Title: 'ليلى حسن' } }),
      baseRow({ AssignedToUser: { Title: 'علي الراشد' } }),
    ]);
    const core = makeCore(site);

    // 'ليلي' (ya) vs the stored 'ليلى' (alef maqsura) — normalizeForFilter folds both to the same
    // form, which a raw server-side substringof against the stored value could never do.
    const rows = await core.getAll({ assignee: 'ليلي' });

    expect(rows).toHaveLength(1);
    expect(rows[0].assignee).toBe('ليلى حسن');
  });

  it('an assignee filter matching nothing returns an empty result rather than the unfiltered set', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [baseRow({ AssignedToUser: { Title: 'Layla Hassan' } })]);
    const core = makeCore(site);

    expect(await core.getAll({ assignee: 'Nobody' })).toHaveLength(0);
  });

  // CORMS_Tasks is the one list whose title is admin-configurable (CORMS_AdminConfig's
  // "Task-List" key, honored by provisioning and by the Part 5 seed script) — the query layer
  // must honor it too, or it reads a list that doesn't exist on a tenant using a custom name.
  it('honors CORMS_AdminConfig\'s Task-List key rather than a hard-coded "CORMS_Tasks"', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedList(site, 'CORMS_AdminConfig', [{ Id: 1, Title: 'Task-List', Value: 'CustomTasksList' }]);
    seedList(site, 'CustomTasksList', [{ Id: 1, ...baseRow({ Title: 'From the custom list' }) }]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe('From the custom list');
  });

  it('falls back to CORMS_Tasks when the Task-List key is absent or blank', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedList(site, 'CORMS_AdminConfig', [{ Id: 1, Title: 'Task-List', Value: '   ' }]);
    seedTasks(site, [baseRow({ Title: 'From the default list' })]);
    const core = makeCore(site);

    const rows = await core.getAll();

    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe('From the default list');
  });

  it('combined filters (type + priority + status) all AND together', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCurrentUserRole(site);
    seedTasks(site, [
      baseRow({ TaskType: 'To Do', Priority: 'High', Status: 'Pending', DueDate: futureDate() }),
      baseRow({ TaskType: 'To Do', Priority: 'Low', Status: 'Pending', DueDate: futureDate() }),
      baseRow({ TaskType: 'Reminder', Priority: 'High', Status: 'Pending', DueDate: futureDate() }),
    ]);
    const core = makeCore(site);

    const rows = await core.getAll({ type: 'To Do', priority: 'High', status: 'Pending' });

    expect(rows).toHaveLength(1);
  });
});

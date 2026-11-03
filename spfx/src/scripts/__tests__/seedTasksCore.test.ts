import { SeedTasksCore, SEED_MARKER_PREFIX } from '../seedTasksCore';
import { createFakeSite, createFakeSp, seedFields, seedList } from '../../services/__tests__/testUtils/fakeSp';
import { CORMS_TASKS_SCHEMA } from '../../provisioning/listSchemas';

const ALL_TASK_FIELDS = CORMS_TASKS_SCHEMA.fields.map((f) => f.name);
const CURRENT_USER_ID = 10;

function seedCompleteTasksSchema(site: ReturnType<typeof createFakeSite>, listTitle = 'CORMS_Tasks'): void {
  seedFields(site, listTitle, ALL_TASK_FIELDS);
}

function makeCore(site: ReturnType<typeof createFakeSite>): SeedTasksCore {
  return new SeedTasksCore(createFakeSp(site));
}

describe('Part 5 — SeedTasksCore', () => {
  it('Part 0: fails fast with a clear error when CORMS_Tasks is missing an expected column, and inserts nothing', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedFields(site, 'CORMS_Tasks', ALL_TASK_FIELDS.filter((n) => n !== 'Description'));
    const core = makeCore(site);

    await expect(core.run()).rejects.toThrow(/missing 1 expected column/i);
    expect(site.lists.CORMS_Tasks?.items ?? []).toHaveLength(0);
  });

  it('Part 0: fails fast with a clear error when CORMS_Tasks does not exist at all', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    const core = makeCore(site);

    await expect(core.run()).rejects.toThrow(/does not exist yet/i);
  });

  it('inserts the expected sample-row count and shape on first run', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCompleteTasksSchema(site);
    const core = makeCore(site);

    const result = await core.run();

    expect(result).toEqual({ inserted: 8, skippedExisting: 0, total: 8 });
    const rows = site.lists.CORMS_Tasks.items;
    expect(rows).toHaveLength(8);
    rows.forEach((row) => {
      expect(String(row.ReferenceNo).indexOf(SEED_MARKER_PREFIX)).toBe(0);
      expect(String(row.ReferenceNo)).toMatch(/^SEED-TSK-\d{4}$/);
    });
    // Covers every TaskType/Priority/Status value at least once.
    expect(new Set(rows.map((r) => r.TaskType))).toEqual(new Set(['To Do', 'Follow-up Task', 'Reminder']));
    expect(new Set(rows.map((r) => r.Priority))).toEqual(new Set(['Low', 'Normal', 'High']));
    expect(new Set(rows.map((r) => r.Status))).toEqual(new Set(['Pending', 'In Progress', 'Completed']));
    // A mix of assigned-to-current-user vs unassigned rows.
    expect(rows.some((r) => r.AssignedToUserId === CURRENT_USER_ID)).toBe(true);
    expect(rows.some((r) => r.AssignedToUserId === undefined)).toBe(true);
    // At least one row has a past due date (exercises computed-Overdue) and at least one Completed
    // row is also past due (must not be excluded from the seed set — it exercises the "must NOT
    // compute as Overdue" branch downstream).
    const today = new Date().toISOString();
    expect(rows.some((r) => String(r.DueDate) < today)).toBe(true);
    expect(rows.some((r) => String(r.DueDate) < today && r.Status === 'Completed')).toBe(true);
  });

  it('idempotency: re-running does not duplicate rows — the second run reports every row as already-existing', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCompleteTasksSchema(site);
    const core = makeCore(site);

    const first = await core.run();
    const second = await core.run();

    expect(first).toEqual({ inserted: 8, skippedExisting: 0, total: 8 });
    expect(second).toEqual({ inserted: 0, skippedExisting: 8, total: 8 });
    expect(site.lists.CORMS_Tasks.items).toHaveLength(8);
  });

  it('idempotency: a partial prior run (some markers already present) only inserts the missing rows', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCompleteTasksSchema(site);
    seedList(site, 'CORMS_Tasks', [{ Id: 1, ReferenceNo: `${SEED_MARKER_PREFIX}0001`, Title: 'Pre-existing' }]);
    const core = makeCore(site);

    const result = await core.run();

    expect(result).toEqual({ inserted: 7, skippedExisting: 1, total: 8 });
    expect(site.lists.CORMS_Tasks.items).toHaveLength(8);
  });

  it('honors CORMS_AdminConfig\'s Task-List key — resolves and seeds a custom list name rather than a hard-coded "CORMS_Tasks"', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedList(site, 'CORMS_AdminConfig', [{ Id: 1, Title: 'Task-List', Value: 'CustomTasksList' }]);
    seedCompleteTasksSchema(site, 'CustomTasksList');
    const core = makeCore(site);

    const result = await core.run();

    expect(result.inserted).toBe(8);
    expect(site.lists.CustomTasksList.items).toHaveLength(8);
    expect(site.lists.CORMS_Tasks).toBeUndefined();
  });

  it('populates RelatedCorrespondenceId from real CORMS_Correspondence rows when they exist', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCompleteTasksSchema(site);
    seedList(site, 'CORMS_Correspondence', [
      { Id: 101, Title: 'Sample correspondence A' },
      { Id: 102, Title: 'Sample correspondence B' },
    ]);
    const core = makeCore(site);

    await core.run();

    const withRelated = site.lists.CORMS_Tasks.items.filter((r) => r.RelatedCorrespondenceId);
    expect(withRelated.length).toBeGreaterThan(0);
    withRelated.forEach((row) => {
      expect(['101', '102']).toContain(row.RelatedCorrespondenceId);
    });
  });

  it('leaves RelatedCorrespondenceId blank when no sample correspondence exists', async () => {
    const site = createFakeSite(CURRENT_USER_ID);
    seedCompleteTasksSchema(site);
    const core = makeCore(site);

    await core.run();

    site.lists.CORMS_Tasks.items.forEach((row) => {
      expect(row.RelatedCorrespondenceId).toBe('');
    });
  });
});

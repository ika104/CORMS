import { AdminConfigServiceLive } from '../AdminConfigService.live';
import { IDevSettingsService } from '../../interfaces/IDevSettingsService';
import { IDevSettingRow } from '../../dataSource/devSettingsMapping';

function makeFakeDevSettingsService(seed: IDevSettingRow[] = []): IDevSettingsService & { rows: IDevSettingRow[] } {
  const state = { rows: seed.map((r) => ({ ...r })) };
  return {
    rows: state.rows,
    getSettings: async () => state.rows.map((r) => ({ ...r })),
    saveSettings: async (rows: IDevSettingRow[]) => {
      rows.forEach((row) => {
        const existing = state.rows.find((r) => r.key === row.key);
        if (existing) Object.assign(existing, row);
        else state.rows.push({ ...row });
      });
    },
  };
}

// Regression coverage: the Admin Config screen (CMS-055/056) used to read a static mock JSON
// fixture that merely resembled CORMS_AdminConfig's shape — an admin editing a value there never
// touched the real list, and new rows added to the real list (e.g. this task's
// powerAppsTaskFormUrl/powerAppsTaskDetailUrl) never appeared on that screen. AdminConfigServiceLive
// is what actually closes that gap — found via a real screenshot of a live tenant where the screen
// was missing rows this task had genuinely provisioned. It also deliberately excludes
// Category: DataSource rows (master/feature.*/listName.*/app.*DataSource) — those already have a
// dedicated toggle/list-name UI on the Data Sources screen; showing them again here as raw
// key/value text would duplicate (and risk drifting out of sync with) that UI.
describe('Admin Config screen — real CORMS_AdminConfig reads/writes', () => {
  it('getEntries() reflects real General/Integration rows, including ones added by other tasks (e.g. powerAppsTaskDetailUrl)', async () => {
    const service = new AdminConfigServiceLive(
      makeFakeDevSettingsService([
        { key: 'RootSiteUrl', value: 'https://example.sharepoint.com/sites/RecordsHub', description: 'Root site URL.', category: 'General' },
        { key: 'powerAppsTaskFormUrl', value: '', description: 'Task form deep link.', category: 'Integration' },
        { key: 'powerAppsTaskDetailUrl', value: '', description: 'Task detail deep link.', category: 'Integration' },
      ])
    );

    const entries = await service.getEntries();

    expect(entries.map((e) => e.key)).toEqual(['RootSiteUrl', 'powerAppsTaskFormUrl', 'powerAppsTaskDetailUrl']);
    expect(entries.find((e) => e.key === 'powerAppsTaskDetailUrl')?.value).toBe('');
  });

  it('getEntries() normalizes a null Value (an empty SharePoint field) to "" so no consumer ever sees null', async () => {
    // A real tenant row (e.g. integration.elasticIndex) can have an empty Value that SharePoint
    // returns as null. Left as null it crashed the Admin Config screen when a cell renderer called a
    // string method on it. The service must hand consumers a string, matching IAdminConfigEntry.
    const service = new AdminConfigServiceLive(
      makeFakeDevSettingsService([
        { key: 'integration.elasticIndex', value: null as unknown as string, description: '', category: 'Integration' },
      ])
    );

    const entries = await service.getEntries();

    expect(entries.find((e) => e.key === 'integration.elasticIndex')?.value).toBe('');
  });

  it('getEntries() excludes Category: DataSource rows — those are the Data Sources screen\'s own toggle/list-name UI, not shown twice', async () => {
    const service = new AdminConfigServiceLive(
      makeFakeDevSettingsService([
        { key: 'RootSiteUrl', value: 'https://example.sharepoint.com', description: '', category: 'General' },
        { key: 'master', value: 'per-feature', description: '', category: 'DataSource' },
        { key: 'feature.ds.menu', value: 'mock', description: '', category: 'DataSource' },
        { key: 'listName.ds.menu', value: '', description: '', category: 'DataSource' },
        { key: 'app.correspondenceDataSource', value: 'mock', description: '', category: 'DataSource' },
        { key: 'app.taskDataSource', value: 'mock', description: '', category: 'DataSource' },
        { key: 'recordsHubSiteUrl', value: '', description: '', category: 'General' },
      ])
    );

    const entries = await service.getEntries();

    expect(entries.map((e) => e.key)).toEqual(['RootSiteUrl', 'recordsHubSiteUrl']);
  });

  it('getEntries() returns an empty array (not a throw) when the list is unavailable', async () => {
    const service = new AdminConfigServiceLive({ getSettings: async () => undefined, saveSettings: async () => undefined });

    expect(await service.getEntries()).toEqual([]);
  });

  it('saveEntry() persists through the real devSettings client and a subsequent getEntries() sees it', async () => {
    const backing = makeFakeDevSettingsService([
      { key: 'powerAppsTaskFormUrl', value: '', description: 'Task form deep link.', category: 'Integration' },
    ]);
    const service = new AdminConfigServiceLive(backing);

    const updated = await service.saveEntry('powerAppsTaskFormUrl', 'https://apps.powerapps.com/task-form');

    expect(updated.value).toBe('https://apps.powerapps.com/task-form');
    expect((await service.getEntries()).find((e) => e.key === 'powerAppsTaskFormUrl')?.value).toBe(
      'https://apps.powerapps.com/task-form'
    );
  });

  it('saveEntry() never overwrites another row sharing the same list', async () => {
    const backing = makeFakeDevSettingsService([
      { key: 'powerAppsTaskFormUrl', value: '', description: '', category: 'Integration' },
      { key: 'app.taskDataSource', value: 'mock', description: '', category: 'DataSource' },
    ]);
    const service = new AdminConfigServiceLive(backing);

    await service.saveEntry('powerAppsTaskFormUrl', 'https://apps.powerapps.com/task-form');

    expect(backing.rows.find((r) => r.key === 'app.taskDataSource')?.value).toBe('mock');
  });

  it('saveEntry() preserves the row\'s existing Category/Description rather than blanking them', async () => {
    const backing = makeFakeDevSettingsService([
      { key: 'powerAppsTaskDetailUrl', value: '', description: 'Task detail deep link.', category: 'Integration' },
    ]);
    const service = new AdminConfigServiceLive(backing);

    await service.saveEntry('powerAppsTaskDetailUrl', 'https://apps.powerapps.com/task-detail?taskId={taskId}');

    const row = backing.rows.find((r) => r.key === 'powerAppsTaskDetailUrl');
    expect(row?.category).toBe('Integration');
    expect(row?.description).toBe('Task detail deep link.');
  });

  // CMS-055 AC1 — admins can add NEW configuration values, not just edit existing ones.
  it('addEntry() creates a new row (default General category) that a subsequent getEntries() sees', async () => {
    const backing = makeFakeDevSettingsService([
      { key: 'RootSiteUrl', value: 'https://example.sharepoint.com', description: '', category: 'General' },
    ]);
    const service = new AdminConfigServiceLive(backing);

    const created = await service.addEntry({ key: 'SLA_ResponseDays', value: '5', description: 'Response SLA in days.' });

    expect(created).toEqual({ key: 'SLA_ResponseDays', value: '5', description: 'Response SLA in days.', category: 'General' });
    const entries = await service.getEntries();
    expect(entries.map((e) => e.key)).toContain('SLA_ResponseDays');
  });

  it('addEntry() honours an explicit Integration category', async () => {
    const backing = makeFakeDevSettingsService([]);
    const service = new AdminConfigServiceLive(backing);

    await service.addEntry({ key: 'integration.newEndpoint', value: 'https://x', description: '', category: 'Integration' });

    expect(backing.rows.find((r) => r.key === 'integration.newEndpoint')?.category).toBe('Integration');
  });

  it('addEntry() rejects a blank key', async () => {
    const service = new AdminConfigServiceLive(makeFakeDevSettingsService([]));
    await expect(service.addEntry({ key: '   ', value: 'x', description: '' })).rejects.toThrow(/key is required/i);
  });

  it('addEntry() rejects a duplicate key (case-insensitive) so it can never overwrite an existing row', async () => {
    const backing = makeFakeDevSettingsService([
      { key: 'RootSiteUrl', value: 'https://existing', description: '', category: 'General' },
    ]);
    const service = new AdminConfigServiceLive(backing);

    await expect(service.addEntry({ key: 'rootsiteurl', value: 'https://new', description: '' })).rejects.toThrow(/already exists/i);
    // The existing row is untouched by the rejected add.
    expect(backing.rows.find((r) => r.key === 'RootSiteUrl')?.value).toBe('https://existing');
  });
});

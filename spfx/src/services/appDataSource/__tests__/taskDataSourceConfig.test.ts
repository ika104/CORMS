import { APP_TASK_DATA_SOURCE_KEY, readAppTaskDataSourceMode, saveAppTaskDataSourceMode } from '../taskDataSourceConfig';
import { APP_CORRESPONDENCE_DATA_SOURCE_KEY, readAppDataSourceMode, saveAppDataSourceMode } from '../appDataSourceConfig';
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

describe('Part 0/4 — app.taskDataSource real persistence (IDevSettingsService-backed)', () => {
  it('readAppTaskDataSourceMode defaults to mock when the row does not exist yet', async () => {
    expect(await readAppTaskDataSourceMode(makeFakeDevSettingsService([]))).toBe('mock');
  });

  it('readAppTaskDataSourceMode reads back a real "live" value', async () => {
    const service = makeFakeDevSettingsService([{ key: APP_TASK_DATA_SOURCE_KEY, value: 'live', category: 'DataSource' }]);

    expect(await readAppTaskDataSourceMode(service)).toBe('live');
  });

  it('saveAppTaskDataSourceMode persists through saveSettings and a subsequent read sees it', async () => {
    const service = makeFakeDevSettingsService([]);

    await saveAppTaskDataSourceMode(service, 'live');

    expect(await readAppTaskDataSourceMode(service)).toBe('live');
  });

  it('saveAppTaskDataSourceMode updates the row in place — no duplicate rows on a second save', async () => {
    const service = makeFakeDevSettingsService([]);

    await saveAppTaskDataSourceMode(service, 'live');
    await saveAppTaskDataSourceMode(service, 'mock');

    const matching = service.rows.filter((r) => r.key === APP_TASK_DATA_SOURCE_KEY);
    expect(matching).toHaveLength(1);
    expect(matching[0].value).toBe('mock');
  });

  // Isolation (Part 6): switching app.taskDataSource must never affect
  // app.correspondenceDataSource (or vice versa) — they're independent keys on the same list.
  it('isolation: saving app.taskDataSource never touches app.correspondenceDataSource, and vice versa', async () => {
    const service = makeFakeDevSettingsService([
      { key: APP_CORRESPONDENCE_DATA_SOURCE_KEY, value: 'mock', category: 'DataSource' },
      { key: APP_TASK_DATA_SOURCE_KEY, value: 'mock', category: 'DataSource' },
    ]);

    await saveAppTaskDataSourceMode(service, 'live');
    expect(await readAppDataSourceMode(service)).toBe('mock');

    await saveAppDataSourceMode(service, 'live');
    expect(await readAppTaskDataSourceMode(service)).toBe('live');
  });

  it("isolation: saveAppTaskDataSourceMode never touches any ds.* row sharing CORMS_AdminConfig", async () => {
    const service = makeFakeDevSettingsService([
      { key: 'master', value: 'per-feature', category: 'DataSource' },
      { key: 'feature.ds.menu', value: 'mock', category: 'DataSource' },
    ]);

    await saveAppTaskDataSourceMode(service, 'live');

    expect(service.rows.find((r) => r.key === 'master')?.value).toBe('per-feature');
    expect(service.rows.find((r) => r.key === 'feature.ds.menu')?.value).toBe('mock');
  });
});

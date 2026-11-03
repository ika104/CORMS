import {
  APP_DELEGATION_DATA_SOURCE_KEY,
  readAppDelegationDataSourceMode,
  saveAppDelegationDataSourceMode,
} from '../delegationDataSourceConfig';
import { APP_TASK_DATA_SOURCE_KEY, readAppTaskDataSourceMode, saveAppTaskDataSourceMode } from '../taskDataSourceConfig';
import { APP_CORRESPONDENCE_DATA_SOURCE_KEY, readAppDataSourceMode } from '../appDataSourceConfig';
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

describe('Part 0/4 — app.delegationDataSource real persistence (IDevSettingsService-backed)', () => {
  it('readAppDelegationDataSourceMode defaults to mock when the row does not exist yet', async () => {
    expect(await readAppDelegationDataSourceMode(makeFakeDevSettingsService([]))).toBe('mock');
  });

  it('readAppDelegationDataSourceMode reads back a real "live" value', async () => {
    const service = makeFakeDevSettingsService([{ key: APP_DELEGATION_DATA_SOURCE_KEY, value: 'live', category: 'DataSource' }]);

    expect(await readAppDelegationDataSourceMode(service)).toBe('live');
  });

  it('saveAppDelegationDataSourceMode persists through saveSettings and a subsequent read sees it', async () => {
    const service = makeFakeDevSettingsService([]);

    await saveAppDelegationDataSourceMode(service, 'live');

    expect(await readAppDelegationDataSourceMode(service)).toBe('live');
  });

  it('saveAppDelegationDataSourceMode updates the row in place — no duplicate rows on a second save', async () => {
    const service = makeFakeDevSettingsService([]);

    await saveAppDelegationDataSourceMode(service, 'live');
    await saveAppDelegationDataSourceMode(service, 'mock');

    const matching = service.rows.filter((r) => r.key === APP_DELEGATION_DATA_SOURCE_KEY);
    expect(matching).toHaveLength(1);
    expect(matching[0].value).toBe('mock');
  });

  // Isolation (Part 5/6): switching app.delegationDataSource must never affect
  // app.correspondenceDataSource or app.taskDataSource (or vice versa) — independent keys on the
  // same list.
  it('isolation: saving app.delegationDataSource never touches app.correspondenceDataSource or app.taskDataSource, and vice versa', async () => {
    const service = makeFakeDevSettingsService([
      { key: APP_CORRESPONDENCE_DATA_SOURCE_KEY, value: 'mock', category: 'DataSource' },
      { key: APP_TASK_DATA_SOURCE_KEY, value: 'mock', category: 'DataSource' },
      { key: APP_DELEGATION_DATA_SOURCE_KEY, value: 'mock', category: 'DataSource' },
    ]);

    await saveAppDelegationDataSourceMode(service, 'live');
    expect(await readAppDataSourceMode(service)).toBe('mock');
    expect(await readAppTaskDataSourceMode(service)).toBe('mock');

    await saveAppTaskDataSourceMode(service, 'live');
    expect(await readAppDelegationDataSourceMode(service)).toBe('live');
  });

  it('isolation: saveAppDelegationDataSourceMode never touches any ds.* row sharing CORMS_AdminConfig', async () => {
    const service = makeFakeDevSettingsService([
      { key: 'master', value: 'per-feature', category: 'DataSource' },
      { key: 'feature.ds.orgHierarchy', value: 'mock', category: 'DataSource' },
    ]);

    await saveAppDelegationDataSourceMode(service, 'live');

    expect(service.rows.find((r) => r.key === 'master')?.value).toBe('per-feature');
    expect(service.rows.find((r) => r.key === 'feature.ds.orgHierarchy')?.value).toBe('mock');
  });
});

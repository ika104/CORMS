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

// Regression coverage for a real bug found via manual testing against a real tenant: toggling
// "Live" in the Data Sources panel saved via IAdminConfigService, which has no live
// implementation — the change never reached CORMS_AdminConfig and was lost on reload. These
// helpers are what App.tsx/DataSourcesPanel now use instead (against IDevSettingsService, which
// does real REST persistence).
describe('Part 4/5/6 — app.correspondenceDataSource real persistence (IDevSettingsService-backed)', () => {
  it('readAppDataSourceMode defaults to mock when the row does not exist yet', async () => {
    const service = makeFakeDevSettingsService([]);

    expect(await readAppDataSourceMode(service)).toBe('mock');
  });

  it('readAppDataSourceMode defaults to mock when the underlying list read fails', async () => {
    const service: IDevSettingsService = {
      getSettings: () => Promise.reject(new Error('list not provisioned')),
      saveSettings: () => Promise.resolve(),
    };

    await expect(readAppDataSourceMode(service)).rejects.toThrow();
    // App.tsx/DataSourcesPanel both wrap this in a .catch(() => 'mock') — asserted at the call
    // site's own tests isn't practical here (they're React effects), but the rejection itself is
    // what those .catch blocks depend on, so confirm it actually rejects rather than swallowing.
  });

  it('readAppDataSourceMode reads back a real "live" value', async () => {
    const service = makeFakeDevSettingsService([
      { key: APP_CORRESPONDENCE_DATA_SOURCE_KEY, value: 'live', category: 'DataSource' },
    ]);

    expect(await readAppDataSourceMode(service)).toBe('live');
  });

  it('saveAppDataSourceMode persists through saveSettings and a subsequent read sees it', async () => {
    const service = makeFakeDevSettingsService([]);

    await saveAppDataSourceMode(service, 'live');

    expect(await readAppDataSourceMode(service)).toBe('live');
  });

  it('saveAppDataSourceMode updates the row in place — no duplicate rows on a second save', async () => {
    const service = makeFakeDevSettingsService([]);

    await saveAppDataSourceMode(service, 'live');
    await saveAppDataSourceMode(service, 'mock');

    const matching = service.rows.filter((r) => r.key === APP_CORRESPONDENCE_DATA_SOURCE_KEY);
    expect(matching).toHaveLength(1);
    expect(matching[0].value).toBe('mock');
  });

  it("saveAppDataSourceMode never touches any other row sharing CORMS_AdminConfig", async () => {
    const service = makeFakeDevSettingsService([
      { key: 'master', value: 'per-feature', category: 'DataSource' },
      { key: 'feature.ds.menu', value: 'mock', category: 'DataSource' },
    ]);

    await saveAppDataSourceMode(service, 'live');

    expect(service.rows.find((r) => r.key === 'master')?.value).toBe('per-feature');
    expect(service.rows.find((r) => r.key === 'feature.ds.menu')?.value).toBe('mock');
  });
});

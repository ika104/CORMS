import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { AppDataSourceMode, DEFAULT_APP_DATA_SOURCE_MODE, parseAppDataSourceMode } from './appDataSourceConfig';

/**
 * `app.taskDataSource` (CMS-049 Part 0/4) — the Task Inbox's own app-owned toggle, a sibling of
 * `app.correspondenceDataSource` (appDataSourceConfig.ts), not a variant of it: each screen's
 * mock/live choice is independent, so this is its own CORMS_AdminConfig row/key rather than
 * reusing the correspondence key. See appDataSourceConfig.ts's file comment for why this whole
 * family of keys is deliberately NOT a `ds.*` FeatureKey (CORMS owns CORMS_Tasks outright, unlike
 * RecordsHub-owned reference data) and is read/written via IDevSettingsService, not
 * IAdminConfigService (no live implementation — see that same file comment).
 */
export const APP_TASK_DATA_SOURCE_KEY = 'app.taskDataSource';

/** Reads just the one row from CORMS_AdminConfig — defaults to mock on any failure, same
 * safe-rollout philosophy as readAppDataSourceMode. */
export async function readAppTaskDataSourceMode(devSettingsService: IDevSettingsService): Promise<AppDataSourceMode> {
  const rows = await devSettingsService.getSettings();
  const row = rows?.find((r) => r.key === APP_TASK_DATA_SOURCE_KEY);
  return parseAppDataSourceMode(row?.value);
}

/** Writes just the one row — saveSettings() create-or-updates by key, so this can't clobber
 * app.correspondenceDataSource or any ds.* / master / recordsHubSiteUrl row sharing the same list. */
export async function saveAppTaskDataSourceMode(devSettingsService: IDevSettingsService, mode: AppDataSourceMode): Promise<void> {
  await devSettingsService.saveSettings([
    {
      key: APP_TASK_DATA_SOURCE_KEY,
      value: mode,
      description: 'mock | live — whether the Task Inbox (My Tasks) reads the bundled demo dataset or real CORMS_Tasks rows.',
      category: 'DataSource',
    },
  ]);
}

export { DEFAULT_APP_DATA_SOURCE_MODE };
export type { AppDataSourceMode };

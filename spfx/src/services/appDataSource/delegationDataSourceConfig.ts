import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { AppDataSourceMode, DEFAULT_APP_DATA_SOURCE_MODE, parseAppDataSourceMode } from './appDataSourceConfig';

/**
 * `app.delegationDataSource` (CMS-017/018/019 Part 0/4) — the Delegation Management + Team Inbox
 * screens' own app-owned toggle, a sibling of `app.correspondenceDataSource`/`app.taskDataSource`,
 * not a variant of either: each screen(-pair)'s mock/live choice is independent, so this is its
 * own CORMS_AdminConfig row/key. One toggle drives all three new services (DelegationService,
 * SubordinateInboxService, ReassignmentService) — they're one screen-pair's data, not three
 * independent surfaces. See appDataSourceConfig.ts's file comment for why this whole family of
 * keys is deliberately NOT a `ds.*` FeatureKey and is read/written via IDevSettingsService, not
 * IAdminConfigService (no live implementation — see that same file comment).
 */
export const APP_DELEGATION_DATA_SOURCE_KEY = 'app.delegationDataSource';

/** Reads just the one row from CORMS_AdminConfig — defaults to mock on any failure, same
 * safe-rollout philosophy as readAppDataSourceMode. */
export async function readAppDelegationDataSourceMode(devSettingsService: IDevSettingsService): Promise<AppDataSourceMode> {
  const rows = await devSettingsService.getSettings();
  const row = rows?.find((r) => r.key === APP_DELEGATION_DATA_SOURCE_KEY);
  return parseAppDataSourceMode(row?.value);
}

/** Writes just the one row — saveSettings() create-or-updates by key, so this can't clobber
 * app.correspondenceDataSource / app.taskDataSource or any ds.* row sharing the same list. */
export async function saveAppDelegationDataSourceMode(devSettingsService: IDevSettingsService, mode: AppDataSourceMode): Promise<void> {
  await devSettingsService.saveSettings([
    {
      key: APP_DELEGATION_DATA_SOURCE_KEY,
      value: mode,
      description:
        'mock | live — whether Delegation Management and Team Inbox (incl. reassignment) read the bundled demo dataset or real CORMS_Delegations / CORMS_Correspondence rows.',
      category: 'DataSource',
    },
  ]);
}

export { DEFAULT_APP_DATA_SOURCE_MODE };
export type { AppDataSourceMode };

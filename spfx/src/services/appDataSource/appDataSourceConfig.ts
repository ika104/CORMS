import { IDevSettingsService } from '../interfaces/IDevSettingsService';

/**
 * `app.correspondenceDataSource` — deliberately NOT a `ds.*` FeatureKey (src/services/dataSource/
 * dataSourceConfig.ts). Every `ds.*` key represents a RecordsHub-owned reference data source
 * (its IFeatureMeta carries a `dependencyRef`/`consumedBy`/`transport` tied to an external D-0x
 * dependency) — CORMS never owns that data, only consumes it. This key is the opposite: it
 * controls whether CORMS's own My Correspondence / Inbox-Sent screens render the earlier UI
 * task's bundled mock dataset or real rows from CORMS's own CORMS_Correspondence list, which the
 * Create Correspondence backend task starts writing to for real. Folding this into
 * FEATURE_REGISTRY/DataSourceConfig would misrepresent CORMS-owned data as a RecordsHub
 * integration point in the Data Sources panel's Consumed-By/Dependency/Transport columns, and
 * would make this one toggle share DataSourceConfig's single persisted blob (and its "Reset"
 * button) with every unrelated ds.* row.
 *
 * Read/written via IDevSettingsService (bundle.devSettings.live), not IAdminConfigService.
 * TODO(confirm) reversed from this file's original version: IAdminConfigService (CMS-055/056)
 * has no live implementation at all (bootstrap.ts wires it to AdminConfigServiceMock
 * unconditionally, a pre-existing, disclosed limitation of that screen) — routing this toggle
 * through it meant "switch to Live" only ever mutated an in-memory mock, never the real
 * CORMS_AdminConfig list, and was lost on reload. Found via manual testing against a real
 * tenant. IDevSettingsService.live already does real, proven SPHttpClient REST against this
 * exact list (for the ds.* / master / recordsHubSiteUrl rows) — reused here for one more row rather
 * than writing a second REST client. Dynamsoft_License_Key is NOT affected by this — it's an
 * informational secret, not a functional switch, and inheriting IAdminConfigService's existing,
 * already-disclosed mock-only limitation is exactly what Part 6 asked for ("same pattern as the
 * existing RH_*_API_Key rows").
 */
export const APP_CORRESPONDENCE_DATA_SOURCE_KEY = 'app.correspondenceDataSource';

export type AppDataSourceMode = 'mock' | 'live';

export const DEFAULT_APP_DATA_SOURCE_MODE: AppDataSourceMode = 'mock';

export function parseAppDataSourceMode(value: string | undefined): AppDataSourceMode {
  return value === 'live' ? 'live' : DEFAULT_APP_DATA_SOURCE_MODE;
}

/** Reads just the one row from CORMS_AdminConfig via the generic devSettings REST client —
 * defaults to mock on any failure (list not provisioned yet, network error, etc.), matching this
 * toggle's "safe rollout" philosophy: never fail open into live. */
export async function readAppDataSourceMode(devSettingsService: IDevSettingsService): Promise<AppDataSourceMode> {
  const rows = await devSettingsService.getSettings();
  const row = rows?.find((r) => r.key === APP_CORRESPONDENCE_DATA_SOURCE_KEY);
  return parseAppDataSourceMode(row?.value);
}

/** Writes just the one row — saveSettings() create-or-updates by key and never touches any other
 * row, so this can't clobber the ds.* / master / recordsHubSiteUrl rows sharing the same list. */
export async function saveAppDataSourceMode(devSettingsService: IDevSettingsService, mode: AppDataSourceMode): Promise<void> {
  await devSettingsService.saveSettings([
    {
      key: APP_CORRESPONDENCE_DATA_SOURCE_KEY,
      value: mode,
      description:
        'mock | live — whether My Correspondence and Inbox/Sent read the bundled demo dataset or real CORMS_Correspondence rows.',
      category: 'DataSource',
    },
  ]);
}

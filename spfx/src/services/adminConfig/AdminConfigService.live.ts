import { IAdminConfigService } from '../interfaces/IAdminConfigService';
import { IAdminConfigEntry, IAddAdminConfigInput } from '../../models/IAdminConfig';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { IDevSettingRow } from '../dataSource/devSettingsMapping';

// Rows in this category are the mock/live feature toggles (`master`, `feature.*`, `listName.*`,
// `app.correspondenceDataSource`, `app.taskDataSource`) — the Data Sources screen
// (`DataSourcesPanel.tsx`) already owns editing them with dedicated toggle/list-name UI. Admin
// Config surfaces the rest of `CORMS_AdminConfig` (General/Integration: site URLs, SLA settings,
// API keys, the Power Apps deep-link URLs, ...) so the same key never gets two different,
// out-of-sync edit surfaces.
const OWNED_BY_DATA_SOURCES_SCREEN: NonNullable<IDevSettingRow['category']> = 'DataSource';

/**
 * CMS-055/056's Admin Config screen (`AdminConfigPanel.tsx`) — real `CORMS_AdminConfig` reads/
 * writes, replacing the earlier `AdminConfigServiceMock` (a static JSON fixture, never actually
 * persisted anywhere). Found via manual testing: an admin editing `powerAppsTaskDetailUrl` on
 * this screen had no way to see it, because the screen was reading a completely different,
 * hard-coded 9-row fixture (`mocks/adminConfig.json`) that happens to *resemble* the real list's
 * shape but isn't wired to it — a pre-existing gap from the earlier CMS-055/056 task, not
 * introduced here, but now actually closed since this task added real rows admins need to reach.
 *
 * Deliberately a thin adapter over the existing, already-proven `IDevSettingsService` (the same
 * live SPHttpClient REST client `app.correspondenceDataSource`/`app.taskDataSource` already use)
 * rather than a second REST client against the same list — `IDevSettingsService.getSettings()`
 * already reads every row, and `saveSettings()` already creates-or-updates by key. No mock/live
 * toggle: `CORMS_AdminConfig` is CORMS-owned data, same "always live" stance as
 * `CORMS_UserRoles`/`CORMS_NavigationMenu` (Epic 1) rather than RecordsHub-owned data's ds.*
 * toggle machinery.
 *
 * `getEntries()` deliberately excludes `Category: 'DataSource'` rows — see
 * `OWNED_BY_DATA_SOURCES_SCREEN` above. Without this, "exactly match the list" would mean showing
 * ~20 `feature.*`/`listName.*` toggle rows here too, duplicating (and risking drifting out of
 * sync with) the dedicated toggle UI Data Sources already provides for exactly those rows —
 * `CORMS_AdminConfig`'s own `Category` column already partitions "which screen owns editing this"
 * (General/Integration here, DataSource there), so this reuses that existing taxonomy rather than
 * inventing a second one.
 */
export class AdminConfigServiceLive implements IAdminConfigService {
  constructor(private readonly devSettingsService: IDevSettingsService) {}

  public async getEntries(): Promise<IAdminConfigEntry[]> {
    const rows = await this.devSettingsService.getSettings();
    return (rows ?? [])
      .filter((row) => row.category !== OWNED_BY_DATA_SOURCES_SCREEN)
      .map((row) => ({
        key: row.key,
        // A SharePoint config row can have an empty (null) Value; normalize to '' so the type's
        // `string` contract holds and consumers never call string methods on null.
        value: row.value ?? '',
        description: row.description ?? '',
        // DataSource rows are already filtered out above; anything else is General/Integration (or
        // an older row with no Category yet). Surfaced so the screen can show the row's bucket and
        // derive its RecordsHub-vs-CORMS owner (CMS-055 AC5).
        category: row.category === 'General' || row.category === 'Integration' ? row.category : undefined,
      }));
  }

  public async saveEntry(key: string, value: string): Promise<IAdminConfigEntry> {
    const rows = await this.devSettingsService.getSettings();
    const existing = rows?.find((row) => row.key === key);
    // Preserving the existing Description/Category on every save — omitting them here would
    // still be a safe no-op against the real list (saveSettings' MERGE only touches fields
    // present in the payload, see DevSettingsService.live.ts), but passing them through keeps the
    // in-memory row this returns accurate without a second round trip.
    await this.devSettingsService.saveSettings([
      { key, value, description: existing?.description, category: existing?.category },
    ]);
    return { key, value, description: existing?.description ?? '' };
  }

  // CMS-055 AC1 — add a brand-new key/value/description within CORMS_AdminConfig. Validation
  // (non-empty key, no duplicate) happens here as the backstop even though the panel checks too:
  // the underlying saveSettings is a MERGE, so an un-guarded duplicate key would silently
  // *overwrite* an existing row's value rather than fail — exactly the accident this rejects.
  public async addEntry(input: IAddAdminConfigInput): Promise<IAdminConfigEntry> {
    const key = input.key.trim();
    if (key.length === 0) throw new Error('A configuration key is required.');
    const rows = await this.devSettingsService.getSettings();
    const duplicate = (rows ?? []).some((row) => row.key.toLowerCase() === key.toLowerCase());
    if (duplicate) throw new Error(`A configuration key "${key}" already exists.`);
    const category = input.category ?? 'General';
    await this.devSettingsService.saveSettings([
      { key, value: input.value, description: input.description, category },
    ]);
    return { key, value: input.value, description: input.description, category };
  }
}

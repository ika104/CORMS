import { IDevSettingRow } from '../dataSource/devSettingsMapping';

/**
 * Reads/writes the data-source rows (master/feature-mode/list-name) of the CORMS_AdminConfig
 * list — a CORMS-owned admin list, not RecordsHub. Named "DevSettings" from the original
 * TASK-04/CORMS_DevSettings task; CORMS_AdminConfig supersedes that list (Sprint 1
 * list-provisioning task) but this interface/class naming was kept to avoid a wide rename —
 * see TODO(confirm) in DevSettingsService.live.ts.
 */
export interface IDevSettingsService {
  /** Resolves to undefined when the backing list is not available (e.g. not yet provisioned). */
  getSettings(): Promise<IDevSettingRow[] | undefined>;
  saveSettings(rows: IDevSettingRow[]): Promise<void>;
}

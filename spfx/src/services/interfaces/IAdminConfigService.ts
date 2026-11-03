import { IAdminConfigEntry, IAddAdminConfigInput } from '../../models/IAdminConfig';

/** CMS-055 — the RecordsHub Configuration List admin screen. */
export interface IAdminConfigService {
  getEntries(): Promise<IAdminConfigEntry[]>;
  /** Edits an EXISTING config value in place (upsert-safe — the underlying list save is a MERGE). */
  saveEntry(key: string, value: string): Promise<IAdminConfigEntry>;
  /** CMS-055 AC1 — ADDS a new configuration value. Rejects a blank key or one that already exists
   * (case-insensitive) so a new key can never silently overwrite an existing row. */
  addEntry(input: IAddAdminConfigInput): Promise<IAdminConfigEntry>;
}

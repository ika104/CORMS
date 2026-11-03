import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { IDevSettingRow } from '../dataSource/devSettingsMapping';

const STORAGE_KEY = 'corms:v1:devSettings:CORMS_AdminConfig';

// Fallback used while CORMS_AdminConfig has not been provisioned on the target site yet
// (spec §5) — same row shape as the live list so the two are interchangeable to callers.
export class DevSettingsServiceLocalStorage implements IDevSettingsService {
  public getSettings(): Promise<IDevSettingRow[] | undefined> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return Promise.resolve(raw === null ? undefined : (JSON.parse(raw) as IDevSettingRow[]));
    } catch {
      return Promise.resolve(undefined);
    }
  }

  public saveSettings(rows: IDevSettingRow[]): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      // localStorage unavailable — best-effort persistence only.
    }
    return Promise.resolve();
  }
}

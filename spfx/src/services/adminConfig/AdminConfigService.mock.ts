import { IAdminConfigService } from '../interfaces/IAdminConfigService';
import { IAdminConfigEntry, IAddAdminConfigInput } from '../../models/IAdminConfig';
import adminConfigMock from '../../mocks/adminConfig.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// Mock stand-in for the RecordsHub Configuration List (CMS-055) — no live implementation yet,
// same reasoning as workflowMatrixService in bootstrap.ts. Mutations are session-only, held in
// this instance's own copy of the seed data, same as WorkflowMatrixServiceMock.
//
// `RootSiteUrl` and `PowerAppsTaskFormUrl` are seeded from the app's own ConfigService rather
// than the static JSON fixture, so this screen visibly reflects the same values the rest of the
// app already resolves through (My Tasks' PowerAppsTaskFormUrl — CMS-050/052) instead of a
// second, disconnected copy of them.
export class AdminConfigServiceMock implements IAdminConfigService {
  private entries: IAdminConfigEntry[];

  public constructor(powerAppsTaskFormUrl: string, recordsHubSiteUrl: string) {
    this.entries = (adminConfigMock as IAdminConfigEntry[]).map((e) => ({ ...e }));
    const rootSiteEntry = this.entries.find((e) => e.key === 'RootSiteUrl');
    if (rootSiteEntry) rootSiteEntry.value = recordsHubSiteUrl;
    const powerAppsEntry = this.entries.find((e) => e.key === 'PowerAppsTaskFormUrl');
    if (powerAppsEntry) powerAppsEntry.value = powerAppsTaskFormUrl;
  }

  public getEntries(): Promise<IAdminConfigEntry[]> {
    return delay([...this.entries]);
  }

  public saveEntry(key: string, value: string): Promise<IAdminConfigEntry> {
    const existing = this.entries.find((e) => e.key === key);
    const updated: IAdminConfigEntry = { key, value, description: existing?.description ?? '', category: existing?.category };
    this.entries = this.entries.map((e) => (e.key === key ? updated : e));
    return delay(updated);
  }

  // CMS-055 AC1 — same validation contract as AdminConfigServiceLive.addEntry.
  public addEntry(input: IAddAdminConfigInput): Promise<IAdminConfigEntry> {
    const key = input.key.trim();
    if (key.length === 0) return Promise.reject(new Error('A configuration key is required.'));
    if (this.entries.some((e) => e.key.toLowerCase() === key.toLowerCase())) {
      return Promise.reject(new Error(`A configuration key "${key}" already exists.`));
    }
    const created: IAdminConfigEntry = {
      key,
      value: input.value,
      description: input.description,
      category: input.category ?? 'General',
    };
    this.entries = [...this.entries, created];
    return delay(created);
  }
}

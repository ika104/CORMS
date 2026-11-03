import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { IDevSettingRow } from '../dataSource/devSettingsMapping';

const LIST_TITLE = 'CORMS_AdminConfig';

interface IListItem {
  Title: string;
  Value: string;
  Description?: string;
  Category?: string;
}

// SP REST implementation backing CORMS_AdminConfig, provisioned in-app via ProvisioningService
// (Sprint 1 list-provisioning task) instead of the earlier browser-console CORMS_DevSettings
// script. Only reads/writes the data-source rows (master/feature.*/listName.*/recordsHubSiteUrl)
// of CORMS_AdminConfig — the RecordsHub Configuration List's general key/value rows (CMS-055/056,
// AdminConfigService) are a separate, still-mock-only concern sharing the same list.
// TODO(confirm): if a CORMS_DevSettings list exists from an earlier task run on a given site,
// this task does not migrate or delete it — see provisioning/README.md and src/provisioning/README.md.
// TODO(confirm): which site hosts CORMS_AdminConfig — currently assumed to be the app's own
// siteUrl (ConfigService), since this is a CORMS-owned admin list, not a RecordsHub list.
export class DevSettingsServiceLive implements IDevSettingsService {
  constructor(
    private readonly context: WebPartContext,
    private readonly siteUrl: string
  ) {}

  public async getSettings(): Promise<IDevSettingRow[] | undefined> {
    const url =
      `${this.siteUrl}/_api/web/lists/getbytitle('${LIST_TITLE}')/items` +
      `?$select=Title,Value,Description,Category`;
    const response: SPHttpClientResponse = await this.context.spHttpClient.get(
      url,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Failed to read ${LIST_TITLE}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: IListItem[] };
    return body.value.map((item) => ({
      key: item.Title,
      value: item.Value,
      description: item.Description,
      category: item.Category as IDevSettingRow['category'],
    }));
  }

  public async saveSettings(rows: IDevSettingRow[]): Promise<void> {
    const existing = await this.fetchExistingByKey();
    for (const row of rows) {
      const current = existing.get(row.key);
      if (current) {
        await this.updateItem(current.id, row);
      } else {
        await this.createItem(row);
      }
    }
  }

  private async fetchExistingByKey(): Promise<Map<string, { id: number }>> {
    const url = `${this.siteUrl}/_api/web/lists/getbytitle('${LIST_TITLE}')/items?$select=Id,Title`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read ${LIST_TITLE}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: Array<{ Id: number; Title: string }> };
    return new Map(body.value.map((item) => [item.Title, { id: item.Id }]));
  }

  private async createItem(row: IDevSettingRow): Promise<void> {
    const url = `${this.siteUrl}/_api/web/lists/getbytitle('${LIST_TITLE}')/items`;
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
      },
      body: JSON.stringify(this.toListItem(row)),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to create ${LIST_TITLE} item "${row.key}": ${response.status} ${response.statusText}`
      );
    }
  }

  private async updateItem(id: number, row: IDevSettingRow): Promise<void> {
    const url = `${this.siteUrl}/_api/web/lists/getbytitle('${LIST_TITLE}')/items(${id})`;
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify(this.toListItem(row)),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to update ${LIST_TITLE} item "${row.key}": ${response.status} ${response.statusText}`
      );
    }
  }

  private toListItem(row: IDevSettingRow): Partial<IListItem> {
    return {
      Title: row.key,
      Value: row.value,
      Description: row.description,
      Category: row.category,
    };
  }
}

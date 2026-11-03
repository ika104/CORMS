import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IRecordsHubService } from '../interfaces/IRecordsHubService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { INavConfig, INavGroup, INavItem } from '../../models/INavModel';
import { IUser } from '../../models/IUser';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { readAdminConfigValues } from '../recordsHubConfig/recordsHubConfig';
import { resolveLiveIdentity } from './resolveLiveIdentity';

// The CORMS_AdminConfig key that holds the RecordsHub site URL an admin sets on the Data Sources
// panel — the single source of truth for it (devSettingsMapping.ts's SITE_URL_KEY). Resolving it
// here keeps the RecordsHub site a per-tenant Admin Config edit, never a hardcoded ConfigService
// constant that has to be recompiled per tenant.
const RECORDS_HUB_SITE_URL_KEY = 'recordsHubSiteUrl';

interface INavListItem {
  Id: number;
  Title: string;
  LabelKey: string;
  Icon: string;
  Path?: string;
  GroupId: string;
  GroupLabelKey?: string;
  SortOrder: number;
  RolesCsv?: string;
}

// Live SP REST implementation of ds.menu (D-01/D-08) against the RecordsHub site's nav list
// (list name resolved from DataSourceConfig.listNames['ds.menu'], falling back to 'CORMS_Menu').
// getCurrentUser() uses SharePoint's built-in currentuser endpoint. getMyCorrespondence() has no
// agreed RecordsHub API yet (TASK-05/CMS-040 territory) — TODO(confirm) — so it returns an empty
// list rather than guessing a schema.
export class RecordsHubServiceLive implements IRecordsHubService {
  constructor(
    private readonly context: WebPartContext,
    private readonly recordsHubSiteUrl: string,
    private readonly navListName: string = 'CORMS_Menu',
    /** When provided, the RecordsHub site URL is resolved live from CORMS_AdminConfig
     * (RECORDS_HUB_SITE_URL_KEY) instead of the injected static value — so a tenant move is an
     * Admin Config edit, not a redeploy. Falls back to `recordsHubSiteUrl` when unset/unreadable. */
    private readonly devSettings?: IDevSettingsService
  ) {}

  /** RecordsHub site (web) absolute URL: the admin-set CORMS_AdminConfig value when available,
   * else the statically-injected fallback. Trailing slashes trimmed so `${base}/_api/...` never
   * doubles up. */
  private async resolveSiteUrl(): Promise<string> {
    if (this.devSettings) {
      try {
        const values = await readAdminConfigValues(this.devSettings);
        const configured = (values[RECORDS_HUB_SITE_URL_KEY] ?? '').trim();
        if (configured) return configured.replace(/\/+$/, '');
      } catch {
        // Fall through to the static fallback — a missing/unreadable Admin Config must not hard-fail
        // identity resolution (which would silently strip the user's role/clearance in useNav).
      }
    }
    return this.recordsHubSiteUrl.replace(/\/+$/, '');
  }

  public async getNavConfig(): Promise<INavConfig> {
    const siteUrl = await this.resolveSiteUrl();
    const url =
      `${siteUrl}/_api/web/lists/getbytitle('${this.navListName}')/items` +
      `?$select=Id,Title,LabelKey,Icon,Path,GroupId,GroupLabelKey,SortOrder,RolesCsv&$orderby=SortOrder asc`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read ${this.navListName}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: INavListItem[] };
    return this.mapNavConfig(body.value);
  }

  public async getCurrentUser(): Promise<IUser> {
    // The numeric SP user ID still comes from the currentuser endpoint (it's the site's own user
    // list item ID, not exposed on pageContext) — everything user-facing (name/email/photo/job
    // title) comes from resolveLiveIdentity, which reads the real signed-in account directly.
    const siteUrl = await this.resolveSiteUrl();
    const url = `${siteUrl}/_api/web/currentuser`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read current user: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { Id: number };
    const identity = await resolveLiveIdentity(this.context, siteUrl);
    return {
      id: String(body.Id),
      displayName: identity.displayName,
      email: identity.email,
      roles: [],
      jobTitle: identity.jobTitle,
      photoUrl: identity.photoUrl,
    };
  }

  // TODO(confirm): no RecordsHub API is agreed for correspondence data yet — owned by TASK-05/CMS-040.
  public getMyCorrespondence(): Promise<ICorrespondenceStub[]> {
    return Promise.resolve([]);
  }

  private mapNavConfig(items: INavListItem[]): INavConfig {
    const groupsById = new Map<string, INavGroup>();
    items.forEach((item) => {
      let group = groupsById.get(item.GroupId);
      if (!group) {
        group = { id: item.GroupId, labelKey: item.GroupLabelKey, items: [] };
        groupsById.set(item.GroupId, group);
      }
      const navItem: INavItem = {
        id: String(item.Id),
        labelKey: item.LabelKey,
        icon: item.Icon,
        path: item.Path,
        roles: item.RolesCsv ? item.RolesCsv.split(',').map((r) => r.trim()) : undefined,
      };
      group.items.push(navItem);
    });
    return { groups: Array.from(groupsById.values()) };
  }
}

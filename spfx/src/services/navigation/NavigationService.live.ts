import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { INavigationService } from '../interfaces/INavigationService';
import { IRecordsHubService } from '../interfaces/IRecordsHubService';
import { INavConfig } from '../../models/INavModel';
import { INavMenuEntryRow } from '../../models/INavigationMenuEntry';
import { CormsRole } from '../../models/ICormsRole';
import { DEFAULT_CLEARANCE_TIER } from '../common/clearance';
import { NavigationServiceCore } from './NavigationServiceCore';

/** Thin wrapper — see CorrespondenceList.live.ts for the identical reasoning behind injecting
 * `recordsHubService` (clearance tier only) and building the real PnPjs SPFI against CORMS's own
 * site. Always live, no ds.* toggle — nav *structure* is CORMS-owned (distinct from ds.menu). */
export class NavigationServiceLive implements INavigationService {
  private readonly core: NavigationServiceCore;

  constructor(context: WebPartContext, siteUrl: string, recordsHubService: IRecordsHubService, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new NavigationServiceCore(sp, async () => {
      const user = await recordsHubService.getCurrentUser();
      return user.clearanceTier ?? DEFAULT_CLEARANCE_TIER;
    });
  }

  public getMenuTree(): Promise<INavConfig> {
    return this.core.getMenuTree();
  }

  public listAllEntries(): Promise<INavMenuEntryRow[]> {
    return this.core.listAllEntries();
  }

  public setVisibility(key: string, isVisible: boolean): Promise<void> {
    return this.core.setVisibility(key, isVisible);
  }

  public setSortOrder(key: string, sortOrder: number): Promise<void> {
    return this.core.setSortOrder(key, sortOrder);
  }

  public setRequiredRoles(key: string, roles: CormsRole[]): Promise<void> {
    return this.core.setRequiredRoles(key, roles);
  }

  public deleteEntry(key: string): Promise<void> {
    return this.core.deleteEntry(key);
  }
}

import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IBadgeCountService } from '../interfaces/IBadgeCountService';
import { IRecordsHubService } from '../interfaces/IRecordsHubService';
import { INavBadge } from '../../models/INavModel';
import { DEFAULT_CLEARANCE_TIER } from '../common/clearance';
import { BadgeCountServiceCore } from './BadgeCountServiceCore';

/** Exposed as its own IServiceContainer entry (not just used internally by NavigationService)
 * since a future screen may want a badge count directly (e.g. a KPI tile) without going through
 * the whole nav tree. */
export class BadgeCountServiceLive implements IBadgeCountService {
  private readonly core: BadgeCountServiceCore;

  constructor(context: WebPartContext, siteUrl: string, recordsHubService: IRecordsHubService, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new BadgeCountServiceCore(sp, async () => {
      const user = await recordsHubService.getCurrentUser();
      return user.clearanceTier ?? DEFAULT_CLEARANCE_TIER;
    });
  }

  public resolveBadge(badgeSourceKey: string | undefined): Promise<INavBadge | undefined> {
    return this.core.resolveBadge(badgeSourceKey);
  }
}

import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ICorrespondenceListService } from '../interfaces/ICorrespondenceListService';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { resolveMyClearanceTierFromUserRoles } from '../common/mapUserRoleRow';
import { CorrespondenceListServiceCore } from './CorrespondenceListServiceCore';

/**
 * Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * CorrespondenceListServiceCore. Always live, no ds.* toggle (CORMS-owned data).
 *
 * Clearance is resolved from CORMS_UserRoles (the caller's own Role + ClearanceTier) via
 * resolveMyClearanceTierFromUserRoles — NOT from RecordsHub's getCurrentUser(), which never
 * populated clearanceTier and so collapsed every user (admins included) to tier 1, leaving Inbox/
 * Sent/Drafts showing only Public/Unclassified. This matches CorrespondenceDetailService.live.ts,
 * so an item visible in a list can also be opened without a clearance mismatch.
 */
export class CorrespondenceListServiceLive implements ICorrespondenceListService {
  private readonly core: CorrespondenceListServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new CorrespondenceListServiceCore(sp, async () =>
      resolveMyClearanceTierFromUserRoles(sp, await getCurrentSiteUserId(sp))
    );
  }

  public getInbox(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.core.getInbox(filters);
  }

  public getSent(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.core.getSent(filters);
  }

  public getDrafts(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.core.getDrafts(filters);
  }
}

import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ICorrespondenceDashboardService } from '../interfaces/ICorrespondenceDashboardService';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { resolveMyClearanceTierFromUserRoles } from '../common/mapUserRoleRow';
import { CorrespondenceDashboardServiceCore } from './CorrespondenceDashboardServiceCore';

/** Thin wrapper — same construction pattern as CorrespondenceListServiceLive. Clearance is resolved
 * from CORMS_UserRoles (the caller's own Role + ClearanceTier), not RecordsHub's getCurrentUser()
 * which never set clearanceTier — that had made My Correspondence show only Public/Unclassified for
 * everyone, admins included. */
export class CorrespondenceDashboardServiceLive implements ICorrespondenceDashboardService {
  private readonly core: CorrespondenceDashboardServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new CorrespondenceDashboardServiceCore(sp, async () =>
      resolveMyClearanceTierFromUserRoles(sp, await getCurrentSiteUserId(sp))
    );
  }

  public getAll(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return this.core.getAll(filters);
  }
}

import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ISubordinateInboxService } from '../interfaces/ISubordinateInboxService';
import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { ITeamInboxQueryItem } from '../../models/ITeamInbox';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { resolveMyClearanceTierFromUserRoles } from '../common/mapUserRoleRow';
import { SubordinateInboxServiceCore } from './SubordinateInboxServiceCore';

/**
 * Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * SubordinateInboxServiceCore. Always live, no ds.* toggle (CORMS-owned data), mirroring
 * CorrespondenceListService.live.ts's exact constructor/injection shape.
 *
 * The *viewing supervisor's* clearance tier is resolved from CORMS_UserRoles (their own Role +
 * ClearanceTier) via resolveMyClearanceTierFromUserRoles, not RecordsHub's getCurrentUser() (which
 * never set clearanceTier and collapsed everyone to tier 1) — same fix as the Inbox/Sent and My
 * Correspondence wrappers.
 *
 * `orgHierarchyService` resolves the supervisor's direct reports (CORMS_UserRoles.ManagerUser) —
 * injected rather than instantiated here, since it's a separately owned, already-built service.
 * The supervisor's own identity is resolved inside the Core against CORMS's own site, not passed
 * down from the UI (see ISubordinateInboxService).
 */
export class SubordinateInboxServiceLive implements ISubordinateInboxService {
  private readonly core: SubordinateInboxServiceCore;

  constructor(
    context: WebPartContext,
    siteUrl: string,
    orgHierarchyService: IOrgHierarchyService,
    spOverride?: SPFI
  ) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new SubordinateInboxServiceCore(
      sp,
      async () => resolveMyClearanceTierFromUserRoles(sp, await getCurrentSiteUserId(sp)),
      orgHierarchyService
    );
  }

  public getTeamInbox(filters?: ICorrespondenceListFilters): Promise<ITeamInboxQueryItem[]> {
    return this.core.getTeamInbox(filters);
  }
}

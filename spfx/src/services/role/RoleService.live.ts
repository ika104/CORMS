import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import '@pnp/sp/site-groups/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IRoleService } from '../interfaces/IRoleService';
import { ICurrentUserRole } from '../../models/ICormsRole';
import { RoleServiceCore } from './RoleServiceCore';

/**
 * Thin wrapper — builds the real PnPjs SPFI instance against CORMS's own site (siteUrl,
 * ConfigService) and delegates to RoleServiceCore. CORMS_UserRoles is CORMS-owned, so this is
 * always live: no mock/live ds.* toggle, unlike RecordsHub-backed services.
 */
export class RoleServiceLive implements IRoleService {
  private readonly core: RoleServiceCore;

  /** `spOverride` exists only so unit tests can inject a fake SPFI-shaped object — see
   * ProvisioningService.ts for the identical pattern. */
  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new RoleServiceCore(sp);
  }

  public getCurrentUserRole(): Promise<ICurrentUserRole> {
    return this.core.getCurrentUserRole();
  }
}

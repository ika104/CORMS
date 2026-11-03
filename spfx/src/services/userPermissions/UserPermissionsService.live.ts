import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IUserPermissions } from '../../models/IUserPermissions';
import { IUserPermissionRecord, IUserPermissionsService } from '../interfaces/IUserPermissionsService';
import { UserPermissionsServiceCore } from './UserPermissionsServiceCore';

/**
 * Thin wrapper — builds the real PnPjs SPFI against CORMS's own site (CORMS_UserRoles lives there)
 * and delegates to UserPermissionsServiceCore. CORMS-owned data, always live, no mock/live toggle —
 * same wiring as RoleServiceLive.
 */
export class UserPermissionsServiceLive implements IUserPermissionsService {
  private readonly core: UserPermissionsServiceCore;

  /** `spOverride` exists only so unit tests can inject a fake SPFI-shaped object — see
   * RoleService.live.ts for the identical pattern. */
  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new UserPermissionsServiceCore(sp);
  }

  public listUsers(): Promise<IUserPermissionRecord[]> {
    return this.core.listUsers();
  }

  public savePermissions(itemId: number, permissions: IUserPermissions): Promise<void> {
    return this.core.savePermissions(itemId, permissions);
  }
}

import type { SPFI } from '@pnp/sp';
import { IDirectoryPerson } from '../../models/IDelegation';
import { getCurrentSiteUserId, parseSiteUserId } from '../common/currentUserId';
import {
  IUserRoleListItem,
  USER_ROLES_DIRECTORY_EXPAND,
  USER_ROLES_DIRECTORY_SELECT,
  USER_ROLES_LIST_TITLE,
  toDirectoryPeople,
} from '../common/mapUserRoleRow';

const RESULT_CAP = 2000;

/**
 * Pure CORMS_UserRoles reporting-line lookup (ds.orgHierarchy live backing) — see
 * provisioningCore.ts's file comment for why Core classes only `import type { SPFI }`.
 * OrgHierarchyService.live.ts is the thin real wrapper.
 */
export class OrgHierarchyServiceCore {
  // TeamInboxView.tsx's own effect (for its "Viewing" dropdown) and SubordinateInboxServiceCore's
  // getTeamInbox() (for its query filter) both resolve "my direct reports" on every Team Inbox
  // mount, and bootstrap.ts deliberately shares one OrgHierarchyServiceLive instance between the two
  // call sites — so an in-flight call collapses concurrent requests into one instead of two nearly
  // simultaneous identity+reports round trips. Neither call site's server-side identity resolution
  // is weakened by this: both still go through getCurrentSiteUserId()/getDirectReports() below,
  // just once instead of twice when they genuinely overlap.
  private inFlightMyDirectReports: Promise<IDirectoryPerson[]> | undefined;

  constructor(private readonly sp: SPFI) {}

  public async getDirectReports(managerId: string): Promise<IDirectoryPerson[]> {
    const managerIdNum = parseSiteUserId(managerId);
    if (managerIdNum === undefined) return [];
    const items = (await this.sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.filter(`ManagerUserId eq ${managerIdNum}`)
      .select(...USER_ROLES_DIRECTORY_SELECT)
      .expand(...USER_ROLES_DIRECTORY_EXPAND)
      .top(RESULT_CAP)()) as IUserRoleListItem[];
    return toDirectoryPeople(items);
  }

  public getMyDirectReports(): Promise<IDirectoryPerson[]> {
    if (!this.inFlightMyDirectReports) {
      this.inFlightMyDirectReports = this.fetchMyDirectReports().finally(() => {
        this.inFlightMyDirectReports = undefined;
      });
    }
    return this.inFlightMyDirectReports;
  }

  private async fetchMyDirectReports(): Promise<IDirectoryPerson[]> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    return this.getDirectReports(String(currentUserId));
  }
}

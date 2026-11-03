import { IDirectoryPerson } from '../../models/IDelegation';

/** ds.orgHierarchy (Delegation & Reassignment Backend task, CMS-018/019) — reporting-line lookups
 * backing the Team Inbox subordinate view and reassignment's both-direct-reports validation. Live
 * backing is CORMS_UserRoles.ManagerUser, the pre-provisioned "authoritative" source per this
 * task's own instruction that ManagerUser wins over any other reporting-line data — there being no
 * second source in this codebase, this service *is* that authoritative path; callers never read
 * CORMS_UserRoles.ManagerUser directly. */
export interface IOrgHierarchyService {
  /** Reports of an explicitly named manager — for service-to-service use, where the manager id has
   * already been resolved server-side. UI callers want getMyDirectReports() instead. */
  getDirectReports(managerId: string): Promise<IDirectoryPerson[]>;
  /** Reports of the signed-in user, with the acting identity resolved server-side against CORMS's
   * own site (getCurrentSiteUserId) rather than taken from the caller — IUser.id is scoped to the
   * RecordsHub site collection and does not match CORMS_UserRoles.ManagerUser's ids. */
  getMyDirectReports(): Promise<IDirectoryPerson[]>;
}

import { ITeamInboxQueryItem } from '../../models/ITeamInbox';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';

/**
 * CMS-018 (Subordinate Inboxes / Team Inbox backend) — query-side service that resolves a
 * supervisor's real CORMS_Correspondence rows across every one of their direct reports
 * (IOrgHierarchyService.getDirectReports), clearance-trimmed to the *supervisor's own* clearance
 * tier. The reassign action itself is a separate concern, owned by ReassignmentService.
 */
export interface ISubordinateInboxService {
  /** The signed-in supervisor's team inbox. Takes no supervisor id: the acting identity is resolved
   * server-side (getCurrentSiteUserId), so one user can never request another supervisor's team,
   * and the UI can never hand in the wrong site collection's user id. */
  getTeamInbox(filters?: ICorrespondenceListFilters): Promise<ITeamInboxQueryItem[]>;
}

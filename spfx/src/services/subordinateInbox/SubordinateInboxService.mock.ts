import { ISubordinateInboxService } from '../interfaces/ISubordinateInboxService';
import { ITeamInboxQueryItem } from '../../models/ITeamInbox';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { applyFilters } from '../correspondenceList/CorrespondenceList.mock';
import { INITIAL_TEAM_INBOX_ITEMS, getPersonName } from '../../modules/teamInbox/mockData';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/**
 * In-memory stand-in for SubordinateInboxServiceLive, built against the existing
 * teamInbox/mockData.ts + mocks/teamInboxItems.json fixtures rather than a second mock data set.
 *
 * Those fixtures already store a `status: TeamInboxStatus` directly (not a raw CORMS_Correspondence
 * Status) — there is no raw-status concept in mock data, so it's passed straight through as
 * `displayStatus`, and a plausible default raw `status: 'Registered'` is synthesized to satisfy
 * ICorrespondenceStub's shape (mock data only, not read back for anything meaningful).
 *
 * Mock mode has no signed-in-user concept, so "the signed-in supervisor" resolves to mockData.ts's
 * hard-coded demo supervisor — its own long-standing precedent, "the app's only mock currentUser
 * has no direct reports, so Team Inbox is demoed as Sara's view regardless of who is logged in".
 * Matches OrgHierarchyServiceMock.getMyDirectReports(), so the grid and the "Viewing" subordinate
 * dropdown agree in the default (mock) data-source mode.
 */
export class SubordinateInboxServiceMock implements ISubordinateInboxService {
  public getTeamInbox(filters?: ICorrespondenceListFilters): Promise<ITeamInboxQueryItem[]> {
    const items: ITeamInboxQueryItem[] = INITIAL_TEAM_INBOX_ITEMS.map((item) => ({
      id: item.id,
      referenceNumber: item.referenceNo,
      subject: item.subject,
      type: item.type,
      direction: 'Incoming',
      status: 'Registered',
      priority: item.priority,
      securityTier: item.securityTier,
      department: '',
      assignedTo: getPersonName(item.ownerId),
      createdAt: item.date,
      ownerId: item.ownerId,
      displayStatus: item.status,
    }));

    return delay(applyFilters(items, filters) as ITeamInboxQueryItem[]);
  }
}

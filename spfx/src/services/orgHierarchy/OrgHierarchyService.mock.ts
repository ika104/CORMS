import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { IDirectoryPerson } from '../../models/IDelegation';
import { CURRENT_SUPERVISOR_ID } from '../../modules/teamInbox/mockData';
import directory from '../../mocks/delegationDirectory.json';
import hierarchy from '../../mocks/orgHierarchy.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

const DIRECTORY = directory as IDirectoryPerson[];
const HIERARCHY = hierarchy as Record<string, string[]>;

/** Mirrors TeamInboxView's earlier hard-coded CURRENT_SUPERVISOR_ID/SUBORDINATE_IDS mock shape
 * (mockData.ts) — moved here so mock mode goes through the same IOrgHierarchyService interface
 * live mode does, rather than the UI reading its own fixture directly. */
export class OrgHierarchyServiceMock implements IOrgHierarchyService {
  public getDirectReports(managerId: string): Promise<IDirectoryPerson[]> {
    const reportIds = HIERARCHY[managerId] ?? [];
    return delay(DIRECTORY.filter((p) => reportIds.indexOf(p.id) !== -1));
  }

  /** Mock mode has no signed-in-user concept, and the app's only mock currentUser (u-1001) has no
   * direct reports — so "mine" resolves to mockData.ts's demo supervisor, preserving the
   * pre-existing "Team Inbox is demoed as Sara's view regardless of who is logged in" behavior
   * rather than rendering an empty screen in the default (mock) data-source mode. */
  public getMyDirectReports(): Promise<IDirectoryPerson[]> {
    return this.getDirectReports(CURRENT_SUPERVISOR_ID);
  }
}

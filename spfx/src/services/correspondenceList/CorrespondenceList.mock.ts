import { ICorrespondenceListService } from '../interfaces/ICorrespondenceListService';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import correspondenceMock from '../../mocks/correspondence.json';

const SIMULATED_LATENCY_MS = 150;
const MOCK_CLEARANCE_TIER = 5;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** Exported so CorrespondenceDashboardService.mock.ts (My Correspondence, Create Correspondence
 * backend task Part 4) can reuse the exact same mock-mode filtering instead of a second copy. */
export function applyFilters(items: ICorrespondenceStub[], filters?: ICorrespondenceListFilters): ICorrespondenceStub[] {
  let result = items.filter((i) => i.securityTier <= MOCK_CLEARANCE_TIER);
  if (filters?.freeText) {
    const term = filters.freeText.toLowerCase();
    result = result.filter(
      (i) => i.subject.toLowerCase().indexOf(term) !== -1 || i.referenceNumber.toLowerCase().indexOf(term) !== -1
    );
  }
  if (filters?.dateFrom) result = result.filter((i) => i.createdAt >= filters.dateFrom!);
  if (filters?.dateTo) result = result.filter((i) => i.createdAt <= filters.dateTo!);
  if (filters?.status) result = result.filter((i) => i.status === filters.status);
  if (filters?.department) result = result.filter((i) => i.department === filters.department);
  if (filters?.quickFilter === 'highPriority') result = result.filter((i) => i.priority === 'High');
  if (filters?.quickFilter === 'unread') result = result.filter((i) => i.seen === false);
  return result;
}

/** In-memory stand-in for testHarness.tsx — CorrespondenceListService has no mock/live toggle in
 * production (always CorrespondenceListServiceLive via bootstrap.ts). */
export class CorrespondenceListServiceMock implements ICorrespondenceListService {
  private readonly all = correspondenceMock as ICorrespondenceStub[];

  public getInbox(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return delay(applyFilters(this.all.filter((i) => i.direction === 'Incoming' && i.status !== 'Draft'), filters));
  }

  public getSent(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return delay(
      applyFilters(
        this.all.filter((i) => (i.direction === 'Outgoing' || i.direction === 'External') && i.status !== 'Draft'),
        filters
      )
    );
  }

  public getDrafts(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return delay(applyFilters(this.all.filter((i) => i.status === 'Draft'), filters));
  }
}

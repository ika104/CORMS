import { ICorrespondenceDashboardService } from '../interfaces/ICorrespondenceDashboardService';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ICorrespondenceListFilters } from '../../models/ICorrespondenceListFilters';
import { applyFilters } from '../correspondenceList/CorrespondenceList.mock';
import correspondenceMock from '../../mocks/correspondence.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** My Correspondence's mock-mode source — the earlier UI task's bundled demo dataset, unchanged.
 * Reuses CorrespondenceListServiceMock's exact filtering (applyFilters) rather than a second
 * implementation; the only difference from Inbox/Sent's mocks is no direction/status narrowing —
 * every row within clearance is in scope, matching CorrespondenceDashboardServiceCore.getAll(). */
export class CorrespondenceDashboardServiceMock implements ICorrespondenceDashboardService {
  private readonly all = correspondenceMock as ICorrespondenceStub[];

  public getAll(filters?: ICorrespondenceListFilters): Promise<ICorrespondenceStub[]> {
    return delay(applyFilters(this.all, filters));
  }
}

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IRecordsHubService } from '../interfaces/IRecordsHubService';
import { INavConfig } from '../../models/INavModel';
import { IUser } from '../../models/IUser';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import navMock from '../../mocks/nav.json';
import usersMock from '../../mocks/users.json';
import correspondenceMock from '../../mocks/correspondence.json';
import { resolveLiveIdentity } from './resolveLiveIdentity';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// Mock stand-in for RecordsHub's menu/metadata APIs (D-01/D-08). Swap the binding
// in bootstrap.ts for a real implementation once the API is available — components
// never reference this class directly.
export class RecordsHubServiceMock implements IRecordsHubService {
  // Optional: undefined outside a real SharePoint page (e.g. unit tests, non-SPFx dev). Who is
  // signed in is never a mock/live-toggle concern (see resolveLiveIdentity) — only the
  // RecordsHub-specific fields nav/correspondence data actually needs (roles, clearance,
  // department) come from the mock file below.
  constructor(private readonly context?: WebPartContext) {}

  public getNavConfig(): Promise<INavConfig> {
    return delay(navMock as INavConfig);
  }

  public async getCurrentUser(): Promise<IUser> {
    const mockUser = usersMock.currentUser as IUser;
    if (!this.context) {
      return delay(mockUser);
    }
    const identity = await resolveLiveIdentity(this.context);
    return delay({
      ...mockUser,
      displayName: identity.displayName,
      email: identity.email,
      photoUrl: identity.photoUrl ?? mockUser.photoUrl,
      jobTitle: identity.jobTitle,
    });
  }

  public getMyCorrespondence(): Promise<ICorrespondenceStub[]> {
    return delay(correspondenceMock as ICorrespondenceStub[]);
  }
}

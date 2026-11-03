import { INavConfig } from '../../models/INavModel';
import { IUser } from '../../models/IUser';
import { ICorrespondenceStub } from '../../models/ICorrespondence';

export interface IRecordsHubService {
  getNavConfig(): Promise<INavConfig>;
  getCurrentUser(): Promise<IUser>;
  getMyCorrespondence(): Promise<ICorrespondenceStub[]>;
}

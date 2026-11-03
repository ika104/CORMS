import { IBadgeCountService } from '../interfaces/IBadgeCountService';
import { INavBadge } from '../../models/INavModel';

export class BadgeCountServiceMock implements IBadgeCountService {
  public resolveBadge(): Promise<INavBadge | undefined> {
    return Promise.resolve(undefined);
  }
}

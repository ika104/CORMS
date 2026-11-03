import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { IDirectoryPerson } from '../../models/IDelegation';
import { OrgHierarchyServiceCore } from './OrgHierarchyServiceCore';

export class OrgHierarchyServiceLive implements IOrgHierarchyService {
  private readonly core: OrgHierarchyServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new OrgHierarchyServiceCore(sp);
  }

  public getDirectReports(managerId: string): Promise<IDirectoryPerson[]> {
    return this.core.getDirectReports(managerId);
  }

  public getMyDirectReports(): Promise<IDirectoryPerson[]> {
    return this.core.getMyDirectReports();
  }
}

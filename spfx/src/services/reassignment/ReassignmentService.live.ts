import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IReassignInput, IReassignmentService } from '../interfaces/IReassignmentService';
import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { ReassignmentServiceCore } from './ReassignmentServiceCore';

/** CMS-019 live wrapper — takes the already-built org hierarchy and audit services so every
 * reassignment is visible through the same Elasticsearch-backed audit trail as the rest of CORMS. */
export class ReassignmentServiceLive implements IReassignmentService {
  private readonly core: ReassignmentServiceCore;

  constructor(
    context: WebPartContext,
    siteUrl: string,
    orgHierarchyService: IOrgHierarchyService,
    auditTrailService: IAuditTrailService,
    spOverride?: SPFI
  ) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new ReassignmentServiceCore(sp, orgHierarchyService, auditTrailService);
  }

  public reassign(input: IReassignInput): Promise<void> {
    return this.core.reassign(input);
  }
}

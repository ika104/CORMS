import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IRouteInput, IRoutingService } from '../interfaces/IRoutingService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { RoutingServiceCore } from './RoutingServiceCore';

/** CMS-011 live wrapper. Auditing is injected so routing shares the application-wide Elasticsearch
 * audit service and cannot silently fall back to the retired SharePoint audit list. */
export class RoutingServiceLive implements IRoutingService {
  private readonly core: RoutingServiceCore;

  constructor(
    context: WebPartContext,
    siteUrl: string,
    auditTrailService: IAuditTrailService,
    spOverride?: SPFI
  ) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new RoutingServiceCore(sp, auditTrailService);
  }

  public route(input: IRouteInput): Promise<void> {
    return this.core.route(input);
  }
}

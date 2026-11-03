import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IApplyClassificationInput, IClassificationService } from '../interfaces/IClassificationService';
import { IAuditTrailService } from '../interfaces/IAuditTrailService';
import { ClassificationServiceCore } from './ClassificationServiceCore';

/** CMS-010 live wrapper. The shared audit service is injected so every audit producer writes to
 * the same append-only Elasticsearch store instead of constructing a private SharePoint writer. */
export class ClassificationServiceLive implements IClassificationService {
  private readonly core: ClassificationServiceCore;

  constructor(
    context: WebPartContext,
    siteUrl: string,
    auditTrailService: IAuditTrailService,
    spOverride?: SPFI
  ) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new ClassificationServiceCore(sp, auditTrailService);
  }

  public applyClassification(input: IApplyClassificationInput): Promise<void> {
    return this.core.applyClassification(input);
  }
}

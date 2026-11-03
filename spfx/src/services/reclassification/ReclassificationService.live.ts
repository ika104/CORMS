import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IReclassificationService } from '../interfaces/IReclassificationService';
import { IReclassificationDecision, IReclassificationInput, IReclassificationRequest } from '../../models/IReclassification';
import { ReclassificationServiceCore } from './ReclassificationServiceCore';

/** CMS-023 live wrapper — real SPFI against CORMS's own site. Always live, no ds.* toggle (CORMS
 * owns CORMS_Correspondence + CORMS_ReclassificationRequests). The audit entry is written by the
 * callers via the shared audit path. */
export class ReclassificationServiceLive implements IReclassificationService {
  private readonly core: ReclassificationServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new ReclassificationServiceCore(sp);
  }

  public applyDirect(input: IReclassificationInput): Promise<void> {
    return this.core.applyDirect(input);
  }
  public requestReclassification(input: IReclassificationInput): Promise<void> {
    return this.core.requestReclassification(input);
  }
  public getPendingRequests(): Promise<IReclassificationRequest[]> {
    return this.core.getPendingRequests();
  }
  public decideRequest(decision: IReclassificationDecision): Promise<void> {
    return this.core.decideRequest(decision);
  }
}

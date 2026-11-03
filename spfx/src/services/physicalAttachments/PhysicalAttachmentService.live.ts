import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IPhysicalAttachmentService } from '../interfaces/IPhysicalAttachmentService';
import { ICreatePhysicalAttachmentInput, IPhysicalAttachmentRecord } from '../../models/IPhysicalAttachmentRecord';
import { PhysicalAttachmentServiceCore } from './PhysicalAttachmentServiceCore';

/** Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * PhysicalAttachmentServiceCore. Always live, no ds.* toggle (CORMS-owned data). */
export class PhysicalAttachmentServiceLive implements IPhysicalAttachmentService {
  private readonly core: PhysicalAttachmentServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new PhysicalAttachmentServiceCore(sp);
  }

  public create(input: ICreatePhysicalAttachmentInput): Promise<IPhysicalAttachmentRecord> {
    return this.core.create(input);
  }

  public getByCorrespondence(correspondenceId: string): Promise<IPhysicalAttachmentRecord[]> {
    return this.core.getByCorrespondence(correspondenceId);
  }

  public search(query: string): Promise<IPhysicalAttachmentRecord[]> {
    return this.core.search(query);
  }
}

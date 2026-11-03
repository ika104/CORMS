import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ICorrespondenceService, IPendingResponseFlag } from '../interfaces/ICorrespondenceService';
import { INumberingService } from '../interfaces/INumberingService';
import { ICreateCorrespondencePayload, ICreateCorrespondenceResult, IDraftEditData } from '../../models/ICorrespondencePayload';
import { CorrespondenceServiceCore } from './CorrespondenceServiceCore';

/**
 * Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * CorrespondenceServiceCore. Always live, no ds.* toggle (CORMS-owned data).
 *
 * `numberingService` is injected already-resolved (mock or live per the existing ds.numbering
 * toggle) rather than re-resolved here — see bootstrap.ts's correspondenceServiceFactory and
 * App.tsx's ResolvedServiceProvider, which builds this with whichever numbering instance
 * ds.numbering currently picks. This service never touches dataSourceConfig.ts/resolveService.ts
 * itself.
 */
export class CorrespondenceServiceLive implements ICorrespondenceService {
  private readonly core: CorrespondenceServiceCore;

  constructor(context: WebPartContext, siteUrl: string, numberingService: INumberingService, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new CorrespondenceServiceCore(sp, numberingService);
  }

  public create(
    payload: ICreateCorrespondencePayload,
    mode: 'draft' | 'submit'
  ): Promise<ICreateCorrespondenceResult> {
    return this.core.create(payload, mode);
  }

  public getDraftForEdit(id: string): Promise<IDraftEditData | undefined> {
    return this.core.getDraftForEdit(id);
  }

  public setPendingResponse(id: string, pending: boolean, flag?: IPendingResponseFlag): Promise<void> {
    return this.core.setPendingResponse(id, pending, flag);
  }
}

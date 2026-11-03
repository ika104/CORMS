import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import '@pnp/sp/batching';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IReadReceiptService } from '../interfaces/IReadReceiptService';
import { ReadReceiptServiceCore } from './ReadReceiptServiceCore';

export class ReadReceiptServiceLive implements IReadReceiptService {
  private readonly core: ReadReceiptServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new ReadReceiptServiceCore(sp);
  }

  public getUnreadIds(correspondenceIds: string[]): Promise<Set<string>> {
    return this.core.getUnreadIds(correspondenceIds);
  }

  public markRead(correspondenceIds: string[]): Promise<void> {
    return this.core.markRead(correspondenceIds);
  }

  public markUnread(correspondenceIds: string[]): Promise<void> {
    return this.core.markUnread(correspondenceIds);
  }
}

import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import '@pnp/sp/folders';
import '@pnp/sp/files';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IAttachmentService } from '../interfaces/IAttachmentService';
import { ICreateAttachmentInput, IAttachmentRecord } from '../../models/IAttachmentRecord';
import { libraryRootServerRelativePath, toUploadBlob } from '../common/spFileUpload';
import { AttachmentServiceCore, IAttachmentContentSurface } from './AttachmentServiceCore';

const LIBRARY_TITLE = 'CORMS_Attachments';

/** Real `@pnp/sp` implementation of IAttachmentContentSurface — the only place in this module
 * that touches PnPjs's file/folder API directly, mirroring DelegationService.live.ts's
 * PnpDelegationAttachmentUploadSurface. */
export class PnpAttachmentContentSurface implements IAttachmentContentSurface {
  private readonly libraryRootPath: string;

  constructor(
    private readonly sp: SPFI,
    siteUrl: string
  ) {
    this.libraryRootPath = libraryRootServerRelativePath(siteUrl, LIBRARY_TITLE);
  }

  public async resolveItemId(serverRelativeUrl: string): Promise<number> {
    const item = await this.sp.web
      .getFileByServerRelativePath(serverRelativeUrl)
      .getItem<{ Id: number }>('Id');
    return item.Id;
  }

  public async uploadPlaceholder(fileName: string, content: Blob): Promise<number> {
    const folder = this.sp.web.getFolderByServerRelativePath(this.libraryRootPath);
    const uploaded = await folder.files.addChunked(fileName, toUploadBlob(content));
    return this.resolveItemId(uploaded.ServerRelativeUrl);
  }
}

/** Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * AttachmentServiceCore. Always live, no ds.* toggle (CORMS-owned data). */
export class AttachmentServiceLive implements IAttachmentService {
  private readonly core: AttachmentServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new AttachmentServiceCore(sp, new PnpAttachmentContentSurface(sp, siteUrl));
  }

  public create(input: ICreateAttachmentInput): Promise<IAttachmentRecord> {
    return this.core.create(input);
  }

  public list(correspondenceId: string): Promise<IAttachmentRecord[]> {
    return this.core.list(correspondenceId);
  }

  public setMainLetter(correspondenceId: string, attachmentId: string): Promise<void> {
    return this.core.setMainLetter(correspondenceId, attachmentId);
  }

  public defaultMainLetterIfNone(correspondenceId: string): Promise<void> {
    return this.core.defaultMainLetterIfNone(correspondenceId);
  }

  public recordQualityOverride(attachmentId: string, reason: string): Promise<void> {
    return this.core.recordQualityOverride(attachmentId, reason);
  }

  public remove(attachmentId: string): Promise<void> {
    return this.core.remove(attachmentId);
  }
}

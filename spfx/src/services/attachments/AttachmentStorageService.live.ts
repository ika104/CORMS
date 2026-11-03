import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/folders';
import '@pnp/sp/files';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { AttachmentStorageServiceCore, IFolderFileSurface } from './AttachmentStorageServiceCore';
import { IStoredFile } from '../../models/IAttachmentRecord';
import { IAttachmentStorageService } from '../interfaces/IAttachmentStorageService';
import { libraryRootServerRelativePath, toUploadBlob } from '../common/spFileUpload';

const LIBRARY_TITLE = 'CORMS_Attachments';

/** Real `@pnp/sp` folder/file implementation of IFolderFileSurface — the only place in this
 * module that touches PnPjs directly, so AttachmentStorageServiceCore stays fully unit-testable
 * without it (see that file's comment). Exported so CorrespondenceDetailService.live.ts (CMS-040
 * getAttachments) can build its own AttachmentStorageServiceCore against the exact same real
 * folder/file logic, for resolving a file's serverRelativeUrl, without duplicating it. */
export class PnpFolderFileSurface implements IFolderFileSurface {
  private readonly libraryRootPath: string;

  constructor(
    private readonly sp: SPFI,
    siteUrl: string
  ) {
    this.libraryRootPath = libraryRootServerRelativePath(siteUrl, LIBRARY_TITLE);
  }

  private fullPath(folderPath: string): string {
    return `${this.libraryRootPath}/${folderPath}`.replace(/\/+/g, '/');
  }

  public async ensureFolder(folderPath: string): Promise<void> {
    // overwrite:true makes this idempotent — SharePoint succeeds instead of erroring when the
    // folder already exists, rather than needing a check-then-create round trip. One segment per
    // correspondence id today, but split defensively per '/'-segment anyway (rather than a single
    // addUsingPath call for the whole path) — SharePoint's AddUsingPath does not reliably
    // auto-create missing *intermediate* folders in one call for every library configuration
    // (found via manual testing against a real tenant, back when this staged into a multi-level
    // Drafts/{sessionId} path).
    const segments = folderPath.split('/').filter(Boolean);
    let relativePath = '';
    for (const segment of segments) {
      relativePath = relativePath ? `${relativePath}/${segment}` : segment;
      await this.sp.web.folders.addUsingPath(this.fullPath(relativePath), true);
    }
  }

  public async uploadFile(
    folderPath: string,
    fileName: string,
    content: Blob | ArrayBuffer
  ): Promise<IStoredFile> {
    const folder = this.sp.web.getFolderByServerRelativePath(this.fullPath(folderPath));
    // toUploadBlob, not `content` directly — PnPjs 4.20's addChunked() throws on a raw ArrayBuffer;
    // see that helper's comment. This interface's signature accepts one, so this path is reachable.
    const result = await folder.files.addChunked(fileName, toUploadBlob(content));
    return { fileName, serverRelativeUrl: result.ServerRelativeUrl };
  }

  public async replaceFile(serverRelativeUrl: string, content: Blob): Promise<void> {
    await this.sp.web.getFileByServerRelativePath(serverRelativeUrl).setContentChunked(content, {});
  }

  public async listFiles(folderPath: string): Promise<IStoredFile[]> {
    const folder = this.sp.web.getFolderByServerRelativePath(this.fullPath(folderPath));
    const files = await folder.files();
    return files.map((f) => ({ fileName: f.Name, serverRelativeUrl: f.ServerRelativeUrl }));
  }
}

/** Thin wrapper — builds the real PnPjs SPFI against CORMS's own site and delegates to
 * AttachmentStorageServiceCore via PnpFolderFileSurface. Always live, no ds.* toggle
 * (CORMS-owned data) — same convention as every other Create Correspondence backend service. */
export class AttachmentStorageServiceLive implements IAttachmentStorageService {
  private readonly core: AttachmentStorageServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new AttachmentStorageServiceCore(new PnpFolderFileSurface(sp, siteUrl));
  }

  public uploadFile(
    correspondenceId: string,
    fileName: string,
    content: Blob | ArrayBuffer
  ): Promise<IStoredFile> {
    return this.core.uploadFile(correspondenceId, fileName, content);
  }

  public listFiles(correspondenceId: string): Promise<IStoredFile[]> {
    return this.core.listFiles(correspondenceId);
  }
}

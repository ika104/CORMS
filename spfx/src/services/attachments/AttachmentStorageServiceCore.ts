/**
 * The binary-file half of attachment storage (CMS-002 AC3) — separate from AttachmentServiceCore,
 * which only ever touches CORMS_Attachments' metadata columns. Files are uploaded directly into a
 * folder keyed by the correspondence item's real id — attachment picking/scanning is held as
 * in-memory form state (never uploaded) until Save Draft/Send actually creates that item, so
 * there's never an interim id to stage files under or migrate away from later.
 *
 * Kept independent of any concrete PnPjs/SPFI type — depends only on the narrow IFolderFileSurface
 * below, which AttachmentStorageService.live.ts implements with real `@pnp/sp` folder/file calls.
 * That keeps this fully unit-testable with a small hand-written fake, without needing folder/file
 * support added to the shared fakeSp.ts test utility (which only models list items, used by every
 * other Core class's tests).
 */

import { IStoredFile } from '../../models/IAttachmentRecord';

export type { IStoredFile };

/** The narrow slice of PnPjs' folder/file surface this class needs — implemented for real by
 * AttachmentStorageService.live.ts, and by a small hand-written fake in this class's own tests. */
export interface IFolderFileSurface {
  ensureFolder(folderPath: string): Promise<void>;
  uploadFile(folderPath: string, fileName: string, content: Blob | ArrayBuffer): Promise<IStoredFile>;
  listFiles(folderPath: string): Promise<IStoredFile[]>;
  /** Replaces an existing file's content in place, so SharePoint keeps the old one as a version. */
  replaceFile(serverRelativeUrl: string, content: Blob): Promise<void>;
}

export class AttachmentStorageServiceCore {
  constructor(private readonly surface: IFolderFileSurface) {}

  /** Uploads real file bytes into CORMS_Attachments/{folderPath}/ — called only once the
   * correspondence item genuinely exists (Save Draft/Send has already run), never before. The
   * caller decides the folder layout (AC11 Year/Month/Serial, via attachmentFolderPath.ts); this
   * stays a generic "put bytes in this folder". */
  public async uploadFile(
    folderPath: string,
    fileName: string,
    content: Blob | ArrayBuffer
  ): Promise<IStoredFile> {
    await this.surface.ensureFolder(folderPath);
    return this.surface.uploadFile(folderPath, fileName, content);
  }

  /** CMS-040 Files tab — resolves the real serverRelativeUrl for every file in a given folder, so
   * CorrespondenceDetailServiceCore.getAttachments can join CORMS_Attachments' metadata rows (which
   * carry no URL) with the real file location. A missing folder (nothing was ever uploaded there) is
   * a normal empty result, not an error. */
  /** Overwrites a stored file's content — used to save each signed version of a main document. */
  public replaceFile(serverRelativeUrl: string, content: Blob): Promise<void> {
    return this.surface.replaceFile(serverRelativeUrl, content);
  }

  public async listFiles(folderPath: string): Promise<IStoredFile[]> {
    if (!folderPath) return [];
    return this.surface.listFiles(folderPath).catch(() => []);
  }
}

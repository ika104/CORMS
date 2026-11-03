import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IFolderService } from '../interfaces/IFolderService';
import { IFolderCriteria, IUserFolder } from '../../models/IFolder';
import { CustomFolderServiceCore } from './CustomFolderServiceCore';

/** Thin wrapper implementing the pre-existing IFolderService interface (CMS-054, Part 5) — no
 * screen-level change needed to consume it, same DI slot FolderServiceMock occupied. Always
 * live, no ds.* toggle (custom folders are user-local CORMS data, not RecordsHub's). */
export class FolderServiceLive implements IFolderService {
  private readonly core: CustomFolderServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new CustomFolderServiceCore(sp);
  }

  public getFolders(): Promise<IUserFolder[]> {
    return this.core.getFolders();
  }

  public createFolder(input: { name: string; criteria: IFolderCriteria }): Promise<IUserFolder> {
    return this.core.createFolder(input);
  }

  public deleteFolder(id: string): Promise<void> {
    return this.core.deleteFolder(id);
  }

  public pinItems(folderId: string, ids: string[]): Promise<IUserFolder> {
    return this.core.pinItems(folderId, ids);
  }

  public unpinItem(folderId: string, id: string): Promise<IUserFolder> {
    return this.core.unpinItem(folderId, id);
  }
}

import { IUserFolder, IFolderCriteria } from '../../models/IFolder';

/** Custom Inbox folders (CMS-054) — user-local saved searches, not a RecordsHub data
 * source, so this does not participate in the ds.* mock/live toggle (see bootstrap.ts). */
export interface IFolderService {
  getFolders(): Promise<IUserFolder[]>;
  createFolder(input: { name: string; criteria: IFolderCriteria }): Promise<IUserFolder>;
  deleteFolder(id: string): Promise<void>;
  /** Idempotent — unions `ids` into the folder's existing manual pins. */
  pinItems(folderId: string, ids: string[]): Promise<IUserFolder>;
  unpinItem(folderId: string, id: string): Promise<IUserFolder>;
}

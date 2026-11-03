import { IFolderService } from '../interfaces/IFolderService';
import { IUserFolder, IFolderCriteria } from '../../models/IFolder';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// In-memory only — custom folders reset on reload, same lifetime as every other mock
// service's seed data. No live implementation exists yet (folders are UI-only for now),
// so this is wired directly in bootstrap.ts rather than through the mock/live toggle.
export class FolderServiceMock implements IFolderService {
  private folders: IUserFolder[] = [];

  public getFolders(): Promise<IUserFolder[]> {
    return delay([...this.folders]);
  }

  public createFolder(input: { name: string; criteria: IFolderCriteria }): Promise<IUserFolder> {
    const folder: IUserFolder = {
      id: `folder-${Date.now()}`,
      name: input.name,
      criteria: input.criteria,
      manualIds: [],
    };
    this.folders = [...this.folders, folder];
    return delay(folder);
  }

  public deleteFolder(id: string): Promise<void> {
    this.folders = this.folders.filter((f) => f.id !== id);
    return delay(undefined);
  }

  public pinItems(folderId: string, ids: string[]): Promise<IUserFolder> {
    this.folders = this.folders.map((f) =>
      f.id === folderId ? { ...f, manualIds: Array.from(new Set([...f.manualIds, ...ids])) } : f
    );
    return delay(this.getFolderOrThrow(folderId));
  }

  public unpinItem(folderId: string, id: string): Promise<IUserFolder> {
    this.folders = this.folders.map((f) =>
      f.id === folderId ? { ...f, manualIds: f.manualIds.filter((x) => x !== id) } : f
    );
    return delay(this.getFolderOrThrow(folderId));
  }

  private getFolderOrThrow(id: string): IUserFolder {
    const folder = this.folders.find((f) => f.id === id);
    if (!folder) throw new Error(`Unknown folder: ${id}`);
    return folder;
  }
}

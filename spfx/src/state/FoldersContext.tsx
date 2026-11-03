import * as React from 'react';
import { IUserFolder, IFolderCriteria } from '../models/IFolder';
import { useServices } from '../services/ServiceProvider';

export interface IFoldersContext {
  folders: IUserFolder[];
  isLoading: boolean;
  createFolder: (input: { name: string; criteria: IFolderCriteria }) => Promise<IUserFolder>;
  deleteFolder: (id: string) => Promise<void>;
  pinItems: (folderId: string, ids: string[]) => Promise<void>;
  unpinItem: (folderId: string, id: string) => Promise<void>;
}

const FoldersContext = React.createContext<IFoldersContext | undefined>(undefined);

// Custom Inbox folders (CMS-054) are read by both the NavRail (nested under Inbox) and
// InboxSentView (folder tabs + contents), which are siblings under AppShell — so folder
// state lives here rather than local to either, and both stay in sync on every mutation.
export const FoldersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { folderService } = useServices();
  const [folders, setFolders] = React.useState<IUserFolder[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // The folder fetch outlives a fast unmount (route change, a test tearing the tree down while
  // the request is still in flight), and landing its result on a torn-down provider is exactly
  // the "state update on an unmounted component" leak React warns about. useNav() already guards
  // its own fetch this way; this one did not.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = React.useCallback(
    () =>
      folderService.getFolders().then((fetched) => {
        if (mountedRef.current) setFolders(fetched);
      }),
    [folderService]
  );

  React.useEffect(() => {
    setIsLoading(true);
    refresh()
      .then(() => {
        if (mountedRef.current) setIsLoading(false);
      })
      .catch(() => {
        if (mountedRef.current) setIsLoading(false);
      });
  }, [refresh]);

  const createFolder = React.useCallback(
    async (input: { name: string; criteria: IFolderCriteria }) => {
      const folder = await folderService.createFolder(input);
      await refresh();
      return folder;
    },
    [folderService, refresh]
  );

  const deleteFolder = React.useCallback(
    async (id: string) => {
      await folderService.deleteFolder(id);
      await refresh();
    },
    [folderService, refresh]
  );

  const pinItems = React.useCallback(
    async (folderId: string, ids: string[]) => {
      await folderService.pinItems(folderId, ids);
      await refresh();
    },
    [folderService, refresh]
  );

  const unpinItem = React.useCallback(
    async (folderId: string, id: string) => {
      await folderService.unpinItem(folderId, id);
      await refresh();
    },
    [folderService, refresh]
  );

  const value = React.useMemo<IFoldersContext>(
    () => ({ folders, isLoading, createFolder, deleteFolder, pinItems, unpinItem }),
    [folders, isLoading, createFolder, deleteFolder, pinItems, unpinItem]
  );

  return <FoldersContext.Provider value={value}>{children}</FoldersContext.Provider>;
};

export function useFolders(): IFoldersContext {
  const ctx = React.useContext(FoldersContext);
  if (!ctx) {
    throw new Error('useFolders must be used within a FoldersProvider');
  }
  return ctx;
}

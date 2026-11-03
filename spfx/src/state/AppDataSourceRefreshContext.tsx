import * as React from 'react';

/**
 * Lets DataSourcesPanel (a deep descendant) tell App.tsx's ResolvedServiceProvider (an ancestor
 * of AppShellProvider, so it can't consume useAppShell()'s navRefreshToken) that
 * app.correspondenceDataSource just changed, without a full page reload — same "admin screen
 * changed something, already-mounted consumers need to know" problem AppShellContext's
 * navRefreshToken/refreshNav solves for CORMS_NavigationMenu, same shape, different tree
 * position (this one has to sit above ResolvedServiceProvider, at the very top of App.tsx, since
 * ResolvedServiceProvider itself is a consumer).
 */
export interface IAppDataSourceRefreshContext {
  refreshToken: number;
  refreshAppDataSource: () => void;
}

const AppDataSourceRefreshContext = React.createContext<IAppDataSourceRefreshContext | undefined>(undefined);

export const AppDataSourceRefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refreshToken, setRefreshToken] = React.useState(0);
  const refreshAppDataSource = React.useCallback(() => setRefreshToken((prev) => prev + 1), []);
  const value = React.useMemo<IAppDataSourceRefreshContext>(
    () => ({ refreshToken, refreshAppDataSource }),
    [refreshToken, refreshAppDataSource]
  );
  return <AppDataSourceRefreshContext.Provider value={value}>{children}</AppDataSourceRefreshContext.Provider>;
};

export function useAppDataSourceRefresh(): IAppDataSourceRefreshContext {
  const ctx = React.useContext(AppDataSourceRefreshContext);
  if (!ctx) {
    throw new Error('useAppDataSourceRefresh must be used within an AppDataSourceRefreshProvider');
  }
  return ctx;
}

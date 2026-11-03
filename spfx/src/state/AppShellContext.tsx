import * as React from 'react';

export interface IAppShellState {
  railPinned: boolean;
  railHoverExpanded: boolean;
  activeModuleId?: string;
}

export interface IAppShellContext extends IAppShellState {
  isRailExpanded: boolean;
  togglePin: () => void;
  setRailHoverExpanded: (expanded: boolean) => void;
  setActiveModuleId: (id: string | undefined) => void;
  /** Bumped by refreshNav() — useNav() watches this to know when to bypass its cache and
   * re-fetch CORMS_NavigationMenu, so the Navigation Menu admin screen's changes (CMS-038 Part 7
   * — "effective immediately, no redeploy") reach the already-mounted NavRail without a full app
   * reload, even though nav state itself lives in each useNav() caller's own local state rather
   * than this context. */
  navRefreshToken: number;
  refreshNav: () => void;
}

const AppShellContext = React.createContext<IAppShellContext | undefined>(undefined);

export interface IAppShellProviderProps {
  children: React.ReactNode;
}

export const AppShellProvider: React.FC<IAppShellProviderProps> = ({ children }) => {
  // Navigation is expanded on first load so labels and nested destinations are discoverable.
  // Users can still collapse it with the existing rail control.
  const [railPinned, setRailPinned] = React.useState(true);
  const [railHoverExpanded, setRailHoverExpanded] = React.useState(false);
  const [activeModuleId, setActiveModuleId] = React.useState<string | undefined>(undefined);
  const [navRefreshToken, setNavRefreshToken] = React.useState(0);

  const togglePin = React.useCallback(() => setRailPinned((prev) => !prev), []);
  const refreshNav = React.useCallback(() => setNavRefreshToken((prev) => prev + 1), []);

  const contextValue = React.useMemo<IAppShellContext>(
    () => ({
      railPinned,
      railHoverExpanded,
      activeModuleId,
      isRailExpanded: railPinned || railHoverExpanded,
      togglePin,
      setRailHoverExpanded,
      setActiveModuleId,
      navRefreshToken,
      refreshNav,
    }),
    [railPinned, railHoverExpanded, activeModuleId, togglePin, navRefreshToken, refreshNav]
  );

  return <AppShellContext.Provider value={contextValue}>{children}</AppShellContext.Provider>;
};

export function useAppShell(): IAppShellContext {
  const ctx = React.useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used within an AppShellProvider');
  }
  return ctx;
}

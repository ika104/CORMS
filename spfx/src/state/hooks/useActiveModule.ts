import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { INavConfig, INavItem } from '../../models/INavModel';
import { defaultNavConfig } from '../../shell/NavRail/navConfig';
import { useAppShell } from '../AppShellContext';
import { useNav } from './useNav';

function flatten(items: INavItem[]): INavItem[] {
  return items.reduce<INavItem[]>(
    (acc, item) => acc.concat(item, item.children ? flatten(item.children) : []),
    []
  );
}

function findActiveItem(config: INavConfig, pathname: string): INavItem | undefined {
  const candidates = flatten(config.groups.reduce<INavItem[]>((acc, g) => acc.concat(g.items), [])).filter(
    (item) => !!item.path && pathname.indexOf(item.path) === 0
  );
  // Deepest (longest) matching path wins, e.g. /inbox-sent/sent over /inbox-sent.
  return candidates.sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];
}

/**
 * Resolves the nav entry that owns the current route and publishes it as the shell's
 * active module, so chrome outside the router (AppBar) can title itself.
 */
export function useActiveModule(): INavItem | undefined {
  const location = useLocation();
  const { navConfig } = useNav();
  const { setActiveModuleId } = useAppShell();

  const activeItem = React.useMemo(
    () => findActiveItem(navConfig ?? defaultNavConfig, location.pathname),
    [navConfig, location.pathname]
  );

  React.useEffect(() => {
    setActiveModuleId(activeItem?.id);
  }, [activeItem, setActiveModuleId]);

  return activeItem;
}

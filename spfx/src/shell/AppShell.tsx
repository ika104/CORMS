import * as React from 'react';
import { NavRail } from './NavRail';
import { ROUTE_OUTLET_ID, ScrollToTop } from './ScrollToTop';
import styles from './AppShell.module.scss';

export interface IAppShellProps {
  children: React.ReactNode;
}

// Reproduces the reference shell layout (§7.7): NavRail and ContentRegion
// (rendered by the router via children). No right panel for now — item details open
// via a dedicated screen (future work), not a side panel.
export const AppShell: React.FC<IAppShellProps> = ({ children }) => (
  <div className={styles.appShell}>
    <ScrollToTop />
    <div className={styles.body}>
      <NavRail />
      <div className={styles.contentRegion}>
        <div id={ROUTE_OUTLET_ID} className={styles.routeOutlet}>
          {children}
        </div>
      </div>
    </div>
  </div>
);

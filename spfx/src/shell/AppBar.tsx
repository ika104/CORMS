import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveModule, useNav } from '../state/hooks';
import { getInitials } from '../utils/getInitials';
import styles from './AppBar.module.scss';

export const AppBar: React.FC = () => {
  const { t } = useTranslation();
  const activeModule = useActiveModule();
  const { currentUser } = useNav();

  return (
    <header className={styles.appBar}>
      <div className={styles.leading}>
        <span className={styles.brand}>{t('app.title')}</span>
        {activeModule && (
          <span className={styles.breadcrumb}>
            OQ8 &middot; {activeModule.label ?? (activeModule.labelKey ? t(activeModule.labelKey) : '')}
          </span>
        )}
        <span className={styles.envLabel}>SharePoint Online</span>
      </div>
      <div className={styles.trailing}>
        {currentUser && (
          <div className={styles.userArea}>
            <div className={styles.avatar}>{getInitials(currentUser.displayName)}</div>
            <span className={styles.userName}>
              {currentUser.displayName}
              {currentUser.jobTitleKey && (
                <> &middot; {t(currentUser.jobTitleKey)}</>
              )}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};

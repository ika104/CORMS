import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import { ISearchTab, tabSubtitle, tabTitle } from '../types';
import styles from '../SearchView.module.scss';

export interface ISavedSearchTabsRailProps {
  tabs: ISearchTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewSearch: () => void;
}

export const SavedSearchTabsRail: React.FC<ISavedSearchTabsRailProps> = ({ tabs, activeId, onSelect, onDelete, onNewSearch }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.rail}>
      <div className={styles.railTitle}>{t('search.rail.title')}</div>
      <button type="button" className={styles.newSearchBtn} onClick={onNewSearch}>
        <Icon name="plus" size={14} />
        {t('search.rail.newSearch')}
      </button>
      <div className={styles.tabList}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`${styles.tabItem} ${tab.id === activeId ? styles.tabItemActive : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            <span className={styles.tabIcon}>
              <Icon name={tab.searchType === 'Correspondence' ? 'mail' : 'fileEdit'} size={16} />
            </span>
            <div className={styles.tabTextWrap}>
              <div className={styles.tabItemTitle}>{tabTitle(tab, t)}</div>
              <div className={styles.tabItemSubtitle}>{tabSubtitle(tab, t)}</div>
            </div>
            <button
              type="button"
              className={styles.tabDeleteBtn}
              aria-label={t('search.rail.deleteTab')}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(tab.id);
              }}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

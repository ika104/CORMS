import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import { ViewMode } from './types';
import styles from './DataGrid.module.scss';

export interface IViewModeToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export const ViewModeToggle: React.FC<IViewModeToggleProps> = ({ viewMode, onViewModeChange }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.viewToggle} role="radiogroup" aria-label={t('grid.toolbar.viewToggle')}>
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === 'cards'}
        className={`${styles.viewToggleBtn} ${viewMode === 'cards' ? styles.viewToggleBtnActive : ''}`}
        onClick={() => onViewModeChange('cards')}
        title={t('grid.toolbar.cards')}
      >
        <Icon name="layoutGrid" size={14} />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={viewMode === 'table'}
        className={`${styles.viewToggleBtn} ${viewMode === 'table' ? styles.viewToggleBtnActive : ''}`}
        onClick={() => onViewModeChange('table')}
        title={t('grid.toolbar.table')}
      >
        <Icon name="list" size={14} />
      </button>
    </div>
  );
};

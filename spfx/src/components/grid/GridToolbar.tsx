import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import { ViewMode } from './types';
import { ViewModeToggle } from './ViewModeToggle';
import styles from './DataGrid.module.scss';

export interface IGridToolbarProps {
  title?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  onRefresh: () => void;
  refreshing?: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  enableViewToggle?: boolean;
}

export const GridToolbar: React.FC<IGridToolbarProps> = ({
  title,
  leftActions,
  rightActions,
  onRefresh,
  refreshing,
  viewMode,
  onViewModeChange,
  enableViewToggle = true,
}) => {
  const { t } = useTranslation();

  return (
    <div className={styles.gridToolbar}>
      <div className={styles.gridToolbarLeft}>
        {title && <div className={styles.gridToolbarTitle}>{title}</div>}
        {leftActions}
      </div>
      <div className={styles.gridToolbarActions}>
        <button
          type="button"
          className={styles.gridToolbarBtn}
          onClick={onRefresh}
          disabled={refreshing}
          title={t('grid.toolbar.refresh')}
        >
          <Icon name="refreshCw" size={16} />
          <span>{t('grid.toolbar.refresh')}</span>
        </button>
        {rightActions}
        {enableViewToggle && <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />}
      </div>
    </div>
  );
};

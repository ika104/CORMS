import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../common/EmptyState';
import { Spinner } from '../common/Spinner';
import { useAppShell } from '../../state/hooks';
import styles from './DataGrid.module.scss';

export interface IDataGridCardsProps<T> {
  rows: T[];
  page: number;
  pageSize: number;
  loading?: boolean;
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  cardRenderer: (row: T, selectionControl?: React.ReactNode) => React.ReactNode;
  emptyStateKey?: string;
  selectable?: boolean;
  isSelected?: (id: string) => boolean;
  allPageSelected?: boolean;
  somePageSelected?: boolean;
  onToggleRow?: (id: string) => void;
  onToggleAllOnPage?: () => void;
}

export function DataGridCards<T>(props: IDataGridCardsProps<T>): React.ReactElement {
  const {
    rows,
    page,
    pageSize,
    loading,
    getRowId,
    onRowClick,
    cardRenderer,
    emptyStateKey,
    selectable,
    isSelected,
    allPageSelected,
    somePageSelected,
    onToggleRow,
    onToggleAllOnPage,
  } = props;
  const { t } = useTranslation();
  // The rail eats horizontal space when pinned/hover-expanded, so cards per row flexes
  // with it — 3 while the rail is open, 4 while it's collapsed to icons-only.
  const { isRailExpanded } = useAppShell();

  if (loading) {
    return (
      <div className={styles.cardsLoadingWrap}>
        <Spinner />
      </div>
    );
  }

  const pagedRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  if (pagedRows.length === 0) {
    return <EmptyState title={t(emptyStateKey || 'grid.empty.default')} />;
  }

  return (
    <>
      {/* A real <label> wrapping the input, so the text is a native click target and the
          control stays keyboard-reachable — a click handler on a bare <span> is neither. */}
      {selectable && pagedRows.length > 0 && (
        <label className={styles.selectAllRow}>
          <input
            type="checkbox"
            className={styles.selectionCheckbox}
            checked={!!allPageSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allPageSelected && !!somePageSelected;
            }}
            onChange={onToggleAllOnPage}
          />
          <span className={styles.selectAllLabel}>
            {t(allPageSelected ? 'grid.selection.deselectAllOnPage' : 'grid.selection.selectAllOnPage')}
          </span>
        </label>
      )}
      <div className={`${styles.cardsGrid} ${isRailExpanded ? styles.cardsGridNarrow : styles.cardsGridWide}`}>
        {pagedRows.map((row) => {
          const id = getRowId(row);
          // The card's selection checkbox — handed to the card so it can render it beside the
          // actions menu (in the header) rather than as a separate row. stopPropagation keeps a
          // checkbox click from also triggering the card's row-click navigation.
          const selectionControl = selectable ? (
            <span className={styles.cardCheckbox} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className={styles.selectionCheckbox}
                checked={isSelected?.(id) ?? false}
                onChange={() => onToggleRow?.(id)}
                aria-label={t('grid.selection.selectRow')}
              />
            </span>
          ) : undefined;
          return (
            <div
              key={id}
              className={`${styles.cardItem} ${onRowClick ? styles.cardItemClickable : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onRowClick(row);
                    }
                  : undefined
              }
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {cardRenderer(row, selectionControl)}
            </div>
          );
        })}
      </div>
    </>
  );
}

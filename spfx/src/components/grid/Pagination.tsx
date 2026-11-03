import * as React from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DataGrid.module.scss';

export interface IPaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export const Pagination: React.FC<IPaginationProps> = ({
  page,
  pageSize,
  totalRows,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}) => {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const start = totalRows === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalRows);

  return (
    <div className={styles.pagination}>
      <div className={styles.paginationLeft}>
        <label className={styles.pageSizeLabel}>
          {t('grid.pagination.rowsPerPage')}
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.paginationCenter}>
        <span className={styles.paginationRange}>
          {t('grid.pagination.range', { start, end, total: totalRows })}
        </span>
      </div>

      <div className={styles.paginationRight}>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          aria-label={t('grid.pagination.first')}
          title={t('grid.pagination.first')}
        >
          &laquo;
        </button>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label={t('grid.pagination.previous')}
          title={t('grid.pagination.previous')}
        >
          &lsaquo;
        </button>
        <span className={styles.pageInfo}>
          {t('grid.pagination.pageOf', { current: page + 1, total: totalPages })}
        </span>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          aria-label={t('grid.pagination.next')}
          title={t('grid.pagination.next')}
        >
          &rsaquo;
        </button>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          aria-label={t('grid.pagination.last')}
          title={t('grid.pagination.last')}
        >
          &raquo;
        </button>
      </div>
    </div>
  );
};

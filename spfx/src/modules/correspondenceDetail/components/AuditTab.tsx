import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Icon } from '../../../components/icons/Icon';
import { Spinner } from '../../../components/common/Spinner';
import { IAuditEntry } from '../../../models/ICorrespondenceDetail';
import { exportRowsToCsv, ICsvColumn } from '../../../utils/exportCsv';
import { formatCardDateTime } from '../../../utils/formatDateTime';
import gridStyles from '../../../components/grid/DataGrid.module.scss';
import styles from './AuditTab.module.scss';

export interface IAuditTabProps {
  entries: IAuditEntry[];
  onRefresh: () => void;
  fileNamePrefix: string;
  /** True while the full audit history is being fetched from Elasticsearch — show a spinner rather
   * than the handful of optimistic session echoes, then render the complete list once it arrives. */
  loading?: boolean;
}

// Per-item, scoped audit view — distinct from the global Audit Trail nav screen (CMS-045),
// which covers all correspondence across the org. Rows here are pre-filtered to just this item.
export const AuditTab: React.FC<IAuditTabProps> = ({ entries, onRefresh, fileNamePrefix, loading = false }) => {
  const { t } = useTranslation();
  const [visibleRows, setVisibleRows] = React.useState<IAuditEntry[]>(entries);

  const columns: DataGridColumn<IAuditEntry>[] = [
    // Newest activity first (the user can still re-sort any column).
    { field: 'seq', headerKey: 'correspondenceDetail.audit.col.seq', filter: 'number', width: 70, initialSort: 'desc' },
    { field: 'action', headerKey: 'correspondenceDetail.audit.col.action', filter: 'text', width: 180 },
    { field: 'actor', headerKey: 'correspondenceDetail.audit.col.actor', filter: 'text', width: 160 },
    { field: 'details', headerKey: 'correspondenceDetail.audit.col.details', filter: 'text', flex: 1, minWidth: 220 },
    {
      field: 'timestamp',
      headerKey: 'correspondenceDetail.audit.col.timestamp',
      filter: 'text',
      width: 160,
      cellRenderer: (row) => <span>{formatCardDateTime(row.timestamp)}</span>,
    },
  ];

  const csvColumns: ICsvColumn<IAuditEntry>[] = [
    { header: t('correspondenceDetail.audit.col.seq'), accessor: (r) => String(r.seq) },
    { header: t('correspondenceDetail.audit.col.action'), accessor: (r) => r.action },
    { header: t('correspondenceDetail.audit.col.actor'), accessor: (r) => r.actor },
    { header: t('correspondenceDetail.audit.col.details'), accessor: (r) => r.details },
    { header: t('correspondenceDetail.audit.col.timestamp'), accessor: (r) => r.timestamp },
  ];

  // Until the Elasticsearch history resolves, show a spinner instead of the partial (echo-only)
  // grid — the whole point is not to flash two rows and then swap in the full list.
  if (loading) {
    return (
      <div className={`${styles.tab} ${styles.loading}`}>
        <Spinner label={t('correspondenceDetail.audit.loading')} />
      </div>
    );
  }

  return (
    <div className={styles.tab}>
      <DataGrid<IAuditEntry>
        columns={columns}
        rows={entries}
        onRefresh={onRefresh}
        getRowId={(row) => row.id}
        enableViewToggle={false}
        gridId="correspondence-detail-audit"
        onFilteredRowsChange={setVisibleRows}
        toolbarRightActions={
          <button
            type="button"
            className={gridStyles.gridToolbarBtn}
            onClick={() => exportRowsToCsv(visibleRows, csvColumns, `${fileNamePrefix}-audit.csv`)}
          >
            <Icon name="download" size={14} />
            <span>{t('myCorrespondence.exportCsv')}</span>
          </button>
        }
      />
    </div>
  );
};

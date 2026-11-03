import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AuditCategory, IGlobalAuditEntry } from '../../models/IAuditTrail';
import { useServices, useAuditViewEvent } from '../../state/hooks';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { Spinner } from '../../components/common/Spinner';
import { exportRowsToCsv, ICsvColumn } from '../../utils/exportCsv';
import styles from './AuditTrailView.module.scss';

type AuditTabId = 'all' | AuditCategory;
const CATEGORY_TABS: AuditCategory[] = ['correspondence', 'system', 'access'];
const TAB_ORDER: AuditTabId[] = ['all', ...CATEGORY_TABS];

const AuditTrailView: React.FC = () => {
  const { t } = useTranslation();
  const { auditTrailService } = useServices();

  const [entries, setEntries] = React.useState<IGlobalAuditEntry[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [tab, setTab] = React.useState<AuditTabId>('all');
  const [visibleRows, setVisibleRows] = React.useState<IGlobalAuditEntry[]>([]);

  // Per-tab, not just per-mount — "opening this screen itself... generates a 'Viewed Tab'
  // audit entry", extended here to every tab switch so read-access stays comprehensively
  // auditable, per the story.
  useAuditViewEvent(`${t('module.auditTrail.title')} — ${t(`auditTrail.category.${tab}`)}`);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    auditTrailService
      .getEntries()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  }, [auditTrailService]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const countFor = (category: AuditCategory): number => (entries ?? []).filter((e) => e.category === category).length;
  const rows = (entries ?? []).filter((e) => tab === 'all' || e.category === tab);

  const columns: DataGridColumn<IGlobalAuditEntry>[] = [
    // Newest-first by default (highest presentation rank on top); the user can still re-sort.
    { field: 'seq', headerKey: 'auditTrail.col.seq', filter: 'number', width: 70, initialSort: 'desc' },
    { field: 'objectId', headerKey: 'auditTrail.col.objectId', filter: 'text', flex: 1, minWidth: 200 },
    { field: 'actor', headerKey: 'auditTrail.col.actor', filter: 'text', width: 170 },
    { field: 'action', headerKey: 'auditTrail.col.action', filter: 'text', width: 220 },
    { field: 'details', headerKey: 'auditTrail.col.details', filter: 'text', flex: 1, minWidth: 260 },
    { field: 'timestamp', headerKey: 'auditTrail.col.timestamp', filter: 'text', width: 160 },
    {
      field: 'chainStatus',
      headerKey: 'auditTrail.col.chainStatus',
      filter: 'text',
      width: 120,
      // Pure UI/mock concept here — TODO(backend): real chain-status must come from the
      // tamper-evident hash-chain verification, not mock data.
      cellRenderer: (row) => (
        <StatusBadge
          label={row.chainStatus === 'valid' ? t('auditTrail.chainStatus.valid') : t('auditTrail.chainStatus.broken')}
          tone={row.chainStatus === 'valid' ? 'success' : 'danger'}
        />
      ),
    },
  ];

  const csvColumns: ICsvColumn<IGlobalAuditEntry>[] = [
    { header: t('auditTrail.col.seq'), accessor: (r) => String(r.seq) },
    { header: t('auditTrail.col.objectId'), accessor: (r) => r.objectId },
    { header: t('auditTrail.col.actor'), accessor: (r) => r.actor },
    { header: t('auditTrail.col.action'), accessor: (r) => r.action },
    { header: t('auditTrail.col.details'), accessor: (r) => r.details },
    { header: t('auditTrail.col.timestamp'), accessor: (r) => r.timestamp },
    { header: t('auditTrail.col.chainStatus'), accessor: (r) => r.chainStatus },
  ];

  return (
    <div className={styles.dashboard}>
      <ModuleHeader
        icon="history"
        title={t('module.auditTrail.title')}
        primaryActionLabel={t('auditTrail.exportDownload')}
        // Each section is independently exportable — respects the active tab's filtered data,
        // not always everything, per the story.
        onPrimaryAction={() => exportRowsToCsv(visibleRows, csvColumns, `audit-trail-${tab}.csv`)}
      />

      {/* First load fetches the whole trail from Elasticsearch — show a spinner until it arrives,
          then render the grid (subsequent refreshes use the grid's own loading overlay). */}
      {entries === undefined ? (
        <div className={styles.centered}>
          <Spinner label={t('auditTrail.loading')} />
        </div>
      ) : (
        <>
          <div className={styles.tabsRow}>
            {TAB_ORDER.map((tabId) => (
              <button
                key={tabId}
                type="button"
                className={`${styles.tab} ${tab === tabId ? styles.tabActive : ''}`}
                onClick={() => setTab(tabId)}
              >
                {t(`auditTrail.category.${tabId}`)}
                {tabId !== 'all' && <span className={styles.tabBadge}>{countFor(tabId)}</span>}
              </button>
            ))}
          </div>

          {/* Append-only — no edit/delete affordance anywhere in this grid. */}
          <DataGrid<IGlobalAuditEntry>
            columns={columns}
            rows={rows}
            loading={loading}
            onRefresh={fetchData}
            getRowId={(row) => row.id}
            enableViewToggle={false}
            gridId={`audit-trail-${tab}`}
            emptyStateKey="auditTrail.noEntries"
            toolbarTitle={t(`auditTrail.category.${tab}`)}
            onFilteredRowsChange={setVisibleRows}
          />
        </>
      )}
    </div>
  );
};

export default AuditTrailView;

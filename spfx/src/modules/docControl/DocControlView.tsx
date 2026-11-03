import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ICorrespondenceStub, SECURITY_TIERS, correspondenceStatusTone } from '../../models/ICorrespondence';
import { useServices, useNav, useAuditViewEvent } from '../../state/hooks';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { Spinner } from '../../components/common/Spinner';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { Icon } from '../../components/icons/Icon';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { exportRowsToCsv, ICsvColumn } from '../../utils/exportCsv';
import { formatCardDateTime } from '../../utils/formatDateTime';
import gridStyles from '../../components/grid/DataGrid.module.scss';
import styles from './DocControlView.module.scss';

// TODO(confirm): no Figma frame for Master Registers — placed as tabs on the Document Control
// screen; confirm placement/navigation once design exists. "Pending Distributions" and
// "Archival" are the screen's existing (Figma-verified) concern per the story; they are not
// specified by this task and are stubbed as "coming soon" here rather than built out.
type DocControlTab = 'pendingDistributions' | 'archival' | 'incomingRegister' | 'outgoingRegister' | 'memoMinutesRegister';

const TAB_ORDER: DocControlTab[] = ['pendingDistributions', 'archival', 'incomingRegister', 'outgoingRegister', 'memoMinutesRegister'];
const REGISTER_TABS: DocControlTab[] = ['incomingRegister', 'outgoingRegister', 'memoMinutesRegister'];

const DEFAULT_MAX_CLEARANCE = 1;

function registerPredicate(tab: DocControlTab): (item: ICorrespondenceStub) => boolean {
  if (tab === 'incomingRegister') return (item) => item.direction === 'Incoming';
  if (tab === 'outgoingRegister') return (item) => item.direction === 'Outgoing' || item.direction === 'External';
  if (tab === 'memoMinutesRegister') return (item) => item.type === 'Memo' || item.type === 'Minutes';
  return () => false;
}

const DocControlView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recordsHubService } = useServices();
  const { currentUser } = useNav();

  const [tab, setTab] = React.useState<DocControlTab>('incomingRegister');
  const [items, setItems] = React.useState<ICorrespondenceStub[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [visibleRows, setVisibleRows] = React.useState<ICorrespondenceStub[]>([]);

  // Per-tab, not just per-mount, so switching between registers stays comprehensively
  // auditable — matches the seeded "Document Control — Incoming Register" style entries.
  useAuditViewEvent(`${t('module.docControl.title')} — ${t(`docControl.tab.${tab}`)}`);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    recordsHubService
      .getMyCorrespondence()
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => {
        setItems([]);
        setLoading(false);
      });
  }, [recordsHubService]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxClearanceTier = currentUser?.clearanceTier ?? DEFAULT_MAX_CLEARANCE;

  const columns: DataGridColumn<ICorrespondenceStub>[] = [
    { field: 'referenceNumber', headerKey: 'docControl.register.col.refNo', filter: 'text', width: 160 },
    { field: 'subject', headerKey: 'docControl.register.col.subject', filter: 'text', flex: 1, minWidth: 220 },
    { field: 'type', headerKey: 'docControl.register.col.type', filter: 'text', width: 120 },
    {
      field: 'createdAt',
      headerKey: 'docControl.register.col.date',
      filter: 'date',
      width: 130,
      cellRenderer: (row) => <span>{formatCardDateTime(row.createdAt)}</span>,
    },
    {
      field: 'status',
      headerKey: 'docControl.register.col.status',
      filter: 'text',
      width: 130,
      cellRenderer: (row) => <StatusBadge label={row.status} tone={correspondenceStatusTone(row.status)} />,
    },
    { field: 'department', headerKey: 'docControl.register.col.department', filter: 'text', width: 140 },
    {
      field: 'securityTier',
      headerKey: 'docControl.register.col.securityLevel',
      filter: 'number',
      width: 150,
      cellRenderer: (row) => (
        <StatusBadge label={SECURITY_TIERS.find((tier) => tier.tier === row.securityTier)?.name ?? String(row.securityTier)} tone="neutral" />
      ),
    },
  ];

  const csvColumns: ICsvColumn<ICorrespondenceStub>[] = [
    { header: t('docControl.register.col.refNo'), accessor: (row) => row.referenceNumber || '' },
    { header: t('docControl.register.col.subject'), accessor: (row) => row.subject },
    { header: t('docControl.register.col.type'), accessor: (row) => row.type },
    { header: t('docControl.register.col.date'), accessor: (row) => row.createdAt },
    { header: t('docControl.register.col.status'), accessor: (row) => row.status },
    { header: t('docControl.register.col.department'), accessor: (row) => row.department },
    {
      header: t('docControl.register.col.securityLevel'),
      accessor: (row) => SECURITY_TIERS.find((tier) => tier.tier === row.securityTier)?.name ?? String(row.securityTier),
    },
  ];

  const renderRegister = (registerTab: DocControlTab): React.ReactNode => {
    // Registers are "maintained automatically as records are numbered and filed" per the
    // story — for this mock UI that just means filtering the same correspondence mock dataset
    // by direction/type per tab, then clearance-trimming the same way Team Inbox/Triage
    // Routing/Search already do (client-side only, re-checked server-side later).
    const rows = (items ?? []).filter((item) => item.securityTier <= maxClearanceTier).filter(registerPredicate(registerTab));

    return (
      <DataGrid<ICorrespondenceStub>
        columns={columns}
        rows={rows}
        loading={loading}
        onRefresh={fetchData}
        getRowId={(row) => row.id}
        onRowClick={(row) =>
          navigate(`/correspondence/${row.id}`, {
            state: { tab: 'preview', originPath: '/doc-control', originLabel: t(`docControl.tab.${registerTab}`) },
          })
        }
        enableViewToggle={false}
        gridId={`doc-control-${registerTab}`}
        emptyStateKey="docControl.register.noItems"
        toolbarTitle={t(`docControl.tab.${registerTab}`)}
        onFilteredRowsChange={setVisibleRows}
        toolbarRightActions={
          <button
            type="button"
            className={gridStyles.gridToolbarBtn}
            title={t('myCorrespondence.exportCsv')}
            onClick={() => exportRowsToCsv(visibleRows, csvColumns, `${registerTab}.csv`)}
          >
            <Icon name="download" size={14} />
            <span>{t('myCorrespondence.exportCsv')}</span>
          </button>
        }
      />
    );
  };

  return (
    <div className={styles.dashboard}>
      <ModuleHeader icon="fileCheck" title={t('module.docControl.title')} />

      <div className={styles.tabsRow}>
        {TAB_ORDER.map((tabId) => (
          <button
            key={tabId}
            type="button"
            className={`${styles.tab} ${tab === tabId ? styles.tabActive : ''}`}
            onClick={() => setTab(tabId)}
          >
            {t(`docControl.tab.${tabId}`)}
          </button>
        ))}
      </div>

      {!items ? (
        <Spinner />
      ) : REGISTER_TABS.indexOf(tab) !== -1 ? (
        renderRegister(tab)
      ) : (
        <EmptyState title={t('common.comingSoon')} description={t('common.comingSoonDescription')} />
      )}
    </div>
  );
};

export default DocControlView;

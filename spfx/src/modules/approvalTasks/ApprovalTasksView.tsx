import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppShell, useNav, useServices } from '../../state/hooks';
import { Icon } from '../../components/icons/Icon';
import { Spinner } from '../../components/common/Spinner';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SummaryTile } from '../../components/common/SummaryTile';
import { SearchBox } from '../../components/common/SearchBox';
import { CorrespondenceCard, ICorrespondenceCardField } from '../../components/common/CorrespondenceCard';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { useServerGrid } from '../../components/grid/useServerGrid';
import { exportRowsToCsv, ICsvColumn } from '../../utils/exportCsv';
import { formatCardDate } from '../../utils/formatDateTime';
import { ApprovalInboxState, IApprovalInboxItem, IApprovalInboxScope } from '../../models/IApprovalInbox';
import { buildApprovalInbox } from '../../services/approvalTasks/approvalInbox';
import { inboxStateBadge } from './approvalTaskBadges';
import { ApprovalTaskModal } from './components/ApprovalTaskModal';
import gridStyles from '../../components/grid/DataGrid.module.scss';
// Same layout as My Tasks, the screen this one sits beside, so the two stay visually identical.
import styles from '../myTasks/MyTasksView.module.scss';

type TileFilterId = 'all' | 'toDo' | 'waiting' | 'overdue' | 'completed';

/** One grid row per task, with a plain field per column so the grid can filter and sort them. */
interface IApprovalTaskRow extends IApprovalInboxItem {
  id: string;
  subject: string;
  referenceNumber: string;
  step: string;
  assignee: string;
  stateLabel: string;
  signatureRequired: boolean;
  dueDate: string;
}

const TILE_PREDICATES: Record<TileFilterId, (item: IApprovalInboxItem) => boolean> = {
  all: () => true,
  toDo: (item) => item.state === 'ToDo',
  waiting: (item) => item.state === 'Waiting',
  overdue: (item) => item.isOverdue,
  completed: (item) => item.state === 'Completed',
};

const TILE_ACCENT = 'var(--corms-toolbar-primary)';
const TILE_CARDS: { id: TileFilterId; labelKey: string; iconName: string }[] = [
  { id: 'all', labelKey: 'approvalTasks.tile.all', iconName: 'listChecks' },
  { id: 'toDo', labelKey: 'approvalTasks.tile.toDo', iconName: 'inbox' },
  { id: 'waiting', labelKey: 'approvalTasks.tile.waiting', iconName: 'clock' },
  { id: 'overdue', labelKey: 'approvalTasks.tile.overdue', iconName: 'alertTriangle' },
  { id: 'completed', labelKey: 'approvalTasks.tile.completed', iconName: 'checkCircle' },
];

// Tasks to act on first, then those still waiting, then the finished ones; earliest due first.
const STATE_ORDER: Record<ApprovalInboxState, number> = { ToDo: 0, Waiting: 1, Completed: 2, Cancelled: 3 };

function compareItems(a: IApprovalInboxItem, b: IApprovalInboxItem): number {
  const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (byState !== 0) return byState;
  const due = (item: IApprovalInboxItem): number =>
    item.correspondence.dueDate ? Date.parse(item.correspondence.dueDate) : Number.MAX_SAFE_INTEGER;
  return due(a) - due(b);
}

const QUEUE_CARD_FIELD_COUNT = 3;

/**
 * Approval Tasks — every approval and signing task assigned to the signed-in user, or to anyone
 * for a System Administrator. Opening a task shows it in context; when it is the approver's turn
 * they sign and decide there, instead of on the correspondence's Approvals tab.
 */
const ApprovalTasksView: React.FC = () => {
  const { t } = useTranslation();
  const { approvalTaskService } = useServices();
  const { currentUser, currentRole } = useNav();
  const { isRailExpanded } = useAppShell();
  const isSystemAdmin = currentRole === 'SystemAdministrator';

  const scope: IApprovalInboxScope = React.useMemo(
    () => ({
      allUsers: isSystemAdmin,
      email: currentUser?.email,
      name: currentUser?.displayName,
      department: currentUser?.department,
    }),
    [isSystemAdmin, currentUser?.email, currentUser?.displayName, currentUser?.department]
  );

  const toRow = React.useCallback(
    (item: IApprovalInboxItem): IApprovalTaskRow => ({
      ...item,
      id: item.task.id,
      subject: item.correspondence.subject,
      referenceNumber: item.correspondence.referenceNumber ?? '',
      step: t('approvalTasks.stepLabel', { order: item.task.stepOrder, name: item.task.stepName }),
      assignee:
        item.task.assignedToName ?? item.task.assignedToTeam ?? t('correspondenceDetail.approvals.unassigned'),
      stateLabel: t(inboxStateBadge(item.state, item.task).labelKey),
      signatureRequired: item.task.requireSignature,
      dueDate: item.correspondence.dueDate ?? '',
    }),
    [t]
  );

  const { rows, loading, refresh } = useServerGrid<IApprovalTaskRow>({
    cacheNamespace: 'approval-tasks',
    cacheKey: scope.allUsers ? 'all' : `mine:${scope.email ?? ''}`,
    queryFn: () =>
      approvalTaskService
        .getInbox(scope)
        .then((source) => buildApprovalInbox(source, scope).sort(compareItems).map(toRow)),
    deps: [approvalTaskService, scope, toRow, !!currentUser],
    enabled: !!currentUser,
  });

  const [selectedTile, setSelectedTile] = React.useState<TileFilterId | undefined>(undefined);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [visibleRows, setVisibleRows] = React.useState<IApprovalTaskRow[]>([]);
  const [openItem, setOpenItem] = React.useState<IApprovalInboxItem | undefined>(undefined);

  if (loading && rows.length === 0) {
    return (
      <div className={styles.dashboard}>
        <Spinner />
      </div>
    );
  }

  const activeTileFilter = TILE_PREDICATES[selectedTile ?? 'all'];
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (row: IApprovalTaskRow): boolean =>
    !query ||
    [row.subject, row.referenceNumber, row.step, row.assignee].some(
      (value) => value.toLowerCase().indexOf(query) !== -1
    );
  const gridRows = rows.filter((item) => activeTileFilter(item) && matchesSearch(item));
  const countFor = (id: TileFilterId): number => rows.filter(TILE_PREDICATES[id]).length;

  const stateBadge = (item: IApprovalInboxItem): React.ReactElement => {
    const badge = inboxStateBadge(item.state, item.task);
    return <StatusBadge label={t(badge.labelKey)} tone={badge.tone} />;
  };
  const dueNode = (item: IApprovalInboxItem): React.ReactNode =>
    item.correspondence.dueDate ? (
      <span style={{ color: item.isOverdue ? 'var(--corms-brand-red)' : 'var(--corms-text-secondary)', fontSize: 12 }}>
        {formatCardDate(item.correspondence.dueDate)}
      </span>
    ) : (
      '—'
    );
  const signatureNode = (item: IApprovalInboxItem): React.ReactNode =>
    item.task.requireSignature ? (
      <Icon name="pen" size={14} aria-label={t('correspondenceDetail.approvals.signatureRequired')} />
    ) : (
      <span style={{ color: 'var(--corms-text-secondary)' }}>—</span>
    );

  const columns: DataGridColumn<IApprovalTaskRow>[] = [
    {
      field: 'subject',
      headerKey: 'approvalTasks.col.subject',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => <span className={styles.tableSubject}>{row.subject}</span>,
    },
    { field: 'referenceNumber', headerKey: 'approvalTasks.col.reference', filter: 'text', width: 190 },
    { field: 'step', headerKey: 'approvalTasks.col.step', filter: 'text', width: 200 },
    { field: 'assignee', headerKey: 'approvalTasks.col.assignee', filter: 'text', width: 160 },
    { field: 'stateLabel', headerKey: 'approvalTasks.col.state', filter: 'text', width: 130, cellRenderer: stateBadge },
    {
      field: 'signatureRequired',
      headerKey: 'approvalTasks.col.signature',
      filter: false,
      width: 100,
      cellRenderer: signatureNode,
    },
    { field: 'dueDate', headerKey: 'approvalTasks.col.dueDate', filter: 'date', width: 120, cellRenderer: dueNode },
  ];

  const csvColumns: ICsvColumn<IApprovalTaskRow>[] = [
    { header: t('approvalTasks.col.subject'), accessor: (row) => row.subject },
    { header: t('approvalTasks.col.reference'), accessor: (row) => row.referenceNumber },
    { header: t('approvalTasks.col.step'), accessor: (row) => row.step },
    { header: t('approvalTasks.col.assignee'), accessor: (row) => row.assignee },
    { header: t('approvalTasks.col.state'), accessor: (row) => row.stateLabel },
    { header: t('approvalTasks.col.signature'), accessor: (row) => (row.signatureRequired ? 'Y' : 'N') },
    { header: t('approvalTasks.col.dueDate'), accessor: (row) => row.dueDate },
  ];

  const itemFields = (row: IApprovalTaskRow): ICorrespondenceCardField[] => [
    { label: t('approvalTasks.col.step'), node: row.step },
    { label: t('approvalTasks.col.state'), node: stateBadge(row) },
    { label: t('approvalTasks.col.dueDate'), node: dueNode(row) },
    { label: t('approvalTasks.col.assignee'), node: row.assignee },
    { label: t('approvalTasks.col.signature'), node: signatureNode(row) },
  ];

  const queueItems = rows.filter((item) => item.state === 'ToDo');

  return (
    <div className={styles.dashboard}>
      <div className={styles.kpiRow}>
        {TILE_CARDS.map((tile) => (
          <SummaryTile
            key={tile.id}
            label={t(tile.labelKey)}
            value={countFor(tile.id)}
            color={TILE_ACCENT}
            iconName={tile.iconName}
            selected={selectedTile === tile.id}
            onClick={() => setSelectedTile((prev) => (prev === tile.id ? undefined : tile.id))}
          />
        ))}
      </div>

      <div className={styles.logCard}>
        <DataGrid<IApprovalTaskRow>
          columns={columns}
          rows={gridRows}
          loading={loading}
          onRefresh={refresh}
          getRowId={(row) => row.id}
          onRowClick={setOpenItem}
          defaultViewMode="cards"
          enableViewToggle={true}
          cardRenderer={(row) => (
            <CorrespondenceCard refNo={row.referenceNumber} subject={row.subject} fields={itemFields(row)} />
          )}
          pageSizeOptions={[10, 20, 50]}
          gridId="approval-tasks"
          emptyStateKey="approvalTasks.noItems"
          toolbarTitle={t(isSystemAdmin ? 'approvalTasks.allTasksTitle' : 'approvalTasks.myTasksTitle')}
          onFilteredRowsChange={setVisibleRows}
          toolbarLeftActions={
            <SearchBox
              value={searchQuery}
              placeholder={t('approvalTasks.searchPlaceholder')}
              onChange={setSearchQuery}
            />
          }
          toolbarRightActions={
            <button
              type="button"
              className={gridStyles.gridToolbarBtn}
              title={t('approvalTasks.exportCsv')}
              onClick={() => exportRowsToCsv(visibleRows, csvColumns, 'approval-tasks.csv')}
            >
              <Icon name="download" size={14} />
              <span>{t('approvalTasks.exportCsv')}</span>
            </button>
          }
        />
      </div>

      <div className={styles.logCard}>
        <div className={styles.queueHeader}>
          <h2 className={styles.queueTitle}>{t('approvalTasks.queue.title', { count: queueItems.length })}</h2>
        </div>
        {queueItems.length === 0 ? (
          <div className={styles.queueEmpty}>{t('approvalTasks.queue.empty')}</div>
        ) : (
          <div
            className={`${gridStyles.cardsGrid} ${
              isRailExpanded ? gridStyles.cardsGridNarrow : gridStyles.cardsGridWide
            }`}
          >
            {queueItems.map((item) => (
              <div
                key={item.id}
                className={styles.queueItem}
                role="button"
                tabIndex={0}
                onClick={() => setOpenItem(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setOpenItem(item);
                }}
              >
                <CorrespondenceCard
                  refNo={item.referenceNumber}
                  subject={item.subject}
                  fields={itemFields(item).slice(0, QUEUE_CARD_FIELD_COUNT)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <ApprovalTaskModal item={openItem} onDismiss={() => setOpenItem(undefined)} onChanged={refresh} />
    </div>
  );
};

export default ApprovalTasksView;

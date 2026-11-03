import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ITask,
  ITaskAssignee,
  ITaskBadgeConfig,
  taskPriorityConfig,
  taskStatusConfig,
  taskTypeConfig,
} from '../../models/ITask';
import { useAppShell, useNav, useServices } from '../../state/hooks';
import { Icon } from '../../components/icons/Icon';
import { Spinner } from '../../components/common/Spinner';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SummaryTile } from '../../components/common/SummaryTile';
import { SearchBox } from '../../components/common/SearchBox';
import { ActionsMenu, IActionsMenuItem } from '../../components/common/ActionsMenu';
import { CorrespondenceCard, ICorrespondenceCardField } from '../../components/common/CorrespondenceCard';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { PowerAppsFormModal } from '../../components/common/PowerAppsFormModal';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { useServerGrid } from '../../components/grid/useServerGrid';
import { exportRowsToCsv, ICsvColumn } from '../../utils/exportCsv';
import { formatCardDate } from '../../utils/formatDateTime';
import {
  IPowerAppsTaskUrls,
  buildTaskDetailUrl,
  buildTaskFormUrl,
  readPowerAppsTaskUrls,
} from '../../services/appDataSource/powerAppsUrls';
import gridStyles from '../../components/grid/DataGrid.module.scss';
import styles from './MyTasksView.module.scss';

const EMPTY_TASK_URLS: IPowerAppsTaskUrls = { taskFormUrl: '', taskDetailUrl: '' };

// ─── Row actions ────────────────────────────────────────────────────────────
// This screen is a listing/display surface only (CMS-049) — task logic (status changes,
// expedite, follow-up) lives in Power Apps, not here. "View Details" (CMS-052) hands off to
// Power Apps via powerAppsTaskDetailUrl; Delete is a thin local removal (no CORMS_Tasks write —
// out of scope for this task, which only reads/displays the list).

function buildRowActions(
  task: ITask,
  taskDetailUrl: string,
  onViewDetails: (taskId: string) => void,
  onRequestDelete: (task: ITask) => void,
  disabledTooltip: string
): IActionsMenuItem[] {
  return [
    {
      key: 'view',
      labelKey: 'myTasks.action.viewDetails',
      iconName: 'eye',
      onClick: taskDetailUrl ? () => onViewDetails(task.id) : undefined,
      title: taskDetailUrl ? undefined : disabledTooltip,
    },
    {
      key: 'delete',
      labelKey: 'myTasks.action.delete',
      iconName: 'trash',
      dividerBefore: true,
      onClick: () => onRequestDelete(task),
    },
  ];
}

// ─── Summary tiles ──────────────────────────────────────────────────────────
// AC3/AC11 — All/Pending/Overdue/My Tasks is the primary row (AC11's explicit ordering), Team
// Tasks alongside (AC3). Exactly the My Correspondence tiles pattern: one predicate object drives
// both a tile's count and its click-to-filter — TaskListServiceCore/TaskListServiceMock
// precompute the isOverdue/isMine/isMyTeam flags these predicates read, nothing here re-derives
// them from Status/DueDate directly.

type TileFilterId = 'all' | 'pending' | 'overdue' | 'team' | 'mine';

const TILE_PREDICATES: Record<TileFilterId, (task: ITask) => boolean> = {
  all: () => true,
  pending: (task) => task.status === 'Pending' || task.status === 'In Progress',
  overdue: (task) => task.isOverdue,
  team: (task) => !!task.isMyTeam,
  mine: (task) => task.isMine,
};

// Client feedback ("too much colour"): every tile's accent follows the single SharePoint site
// theme colour (--corms-toolbar-primary, which tracks "Change the look") instead of a per-tile
// hue, so the row reads as one accent. Same treatment as the My Correspondence tiles.
const TILE_ACCENT = 'var(--corms-toolbar-primary)';
const TILE_CARDS: { id: TileFilterId; labelKey: string; color: string; iconName: string }[] = [
  { id: 'all', labelKey: 'myTasks.tile.all', color: TILE_ACCENT, iconName: 'listChecks' },
  { id: 'pending', labelKey: 'myTasks.tile.pending', color: TILE_ACCENT, iconName: 'inbox' },
  { id: 'overdue', labelKey: 'myTasks.tile.overdue', color: TILE_ACCENT, iconName: 'alertTriangle' },
  { id: 'mine', labelKey: 'myTasks.tile.mine', color: TILE_ACCENT, iconName: 'userCog' },
  { id: 'team', labelKey: 'myTasks.tile.team', color: TILE_ACCENT, iconName: 'users' },
];

const QUEUE_STATUSES: ITask['status'][] = ['Pending', 'In Progress'];

// The Task Queue card is the compact form of the log card: same fields, first three only.
const QUEUE_CARD_FIELD_COUNT = 3;
const MAX_VISIBLE_ASSIGNEES = 3;

function assigneeTooltip(assignee: ITaskAssignee): string {
  // A few legacy people rows do not expose EMail. Keep their avatar useful instead of displaying
  // an empty tooltip, while live multi-person rows show the requested email address.
  return assignee.email || assignee.displayName;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase();
}

/** Compact, non-interactive counterpart of the Microsoft sharing avatar stack. It deliberately
 * caps the visual group at three people so the card stays scannable; the +N avatar exposes the
 * full assignee email list on hover and through its accessible name. */
export const TaskAssigneeAvatars: React.FC<{ assignees: ITaskAssignee[] }> = ({ assignees }) => {
  if (assignees.length === 0) return <span className={styles.noAssignee}>—</span>;

  const visible = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const remaining = assignees.length - visible.length;
  const allEmails = assignees.map(assigneeTooltip).join(', ');

  return (
    <div className={styles.assigneeAvatars} role="list" aria-label={`Assigned to ${allEmails}`}>
      {visible.map((assignee, index) => (
        <span
          key={assignee.id ?? assignee.email ?? assignee.displayName}
          className={styles.assigneeAvatar}
          style={{ zIndex: MAX_VISIBLE_ASSIGNEES - index }}
          role="listitem"
          title={assigneeTooltip(assignee)}
          aria-label={assigneeTooltip(assignee)}
        >
          {initials(assignee.displayName || assignee.email || '')}
        </span>
      ))}
      {remaining > 0 && (
        <span
          className={`${styles.assigneeAvatar} ${styles.assigneeAvatarOverflow}`}
          role="listitem"
          title={allEmails}
          aria-label={`All assignees: ${allEmails}`}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
};

// ─── Main view ──────────────────────────────────────────────────────────────

const MyTasksView: React.FC = () => {
  const { t } = useTranslation();
  const { taskListService, devSettingsService } = useServices();
  const { currentUser } = useNav();
  // Same rule as the shared DataGridCards: 3 per row while the rail is open, 4 once
  // it's collapsed to icons-only.
  const { isRailExpanded } = useAppShell();

  // Real CORMS_Tasks data when app.taskDataSource is live, the earlier UI task's bundled mock
  // dataset when mock (App.tsx's ResolvedServiceProvider already resolved which one this is) —
  // routed through the same useServerGrid layer the EPIC 14 grid task built (CMS-044/AC9), this
  // screen's second consumer of it after My Correspondence.
  const {
    rows: fetchedTasks,
    loading,
    refresh: fetchData,
  } = useServerGrid<ITask>({
    cacheNamespace: 'my-tasks',
    cacheKey: 'all',
    queryFn: () => taskListService.getAll(),
    deps: [taskListService],
  });

  // Local-only optimistic removal for Delete (no CORMS_Tasks write — out of this task's scope,
  // see buildRowActions' comment) — same "reset whenever a fresh fetch lands" rule as My
  // Correspondence's localPatches.
  const [deletedIds, setDeletedIds] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setDeletedIds(new Set()), [fetchedTasks]);
  const tasks = React.useMemo(
    () =>
      fetchedTasks
        .filter((task) => !deletedIds.has(task.id))
        .slice()
        // Live rows always have SharePoint's Created timestamp. Due date is a safe fallback for
        // legacy/mock rows that predate that field.
        .sort((a, b) => Date.parse(b.createdAt ?? b.dueDate) - Date.parse(a.createdAt ?? a.dueDate)),
    [fetchedTasks, deletedIds]
  );

  // undefined = no tile selected, which shows everything (same rows as the "all" tile).
  const [selectedTile, setSelectedTile] = React.useState<TileFilterId | undefined>(undefined);
  const [searchQuery, setSearchQuery] = React.useState('');
  // Mirrors whatever the grid currently has on screen (post column-filter/sort), for CSV export.
  const [visibleRows, setVisibleRows] = React.useState<ITask[]>([]);
  // Task pending user confirmation before its Delete action actually runs.
  const [pendingDelete, setPendingDelete] = React.useState<ITask | undefined>(undefined);
  // The Power Apps form (create or detail) currently embedded in the overlay; undefined = closed.
  const [embeddedForm, setEmbeddedForm] = React.useState<
    { url: string; title: string; kind: 'create' | 'detail' } | undefined
  >(undefined);

  // CMS-050/052 Part 0 — read from the real CORMS_AdminConfig rows (powerAppsTaskFormUrl/
  // powerAppsTaskDetailUrl), not the earlier UI task's hard-coded ConfigService placeholders. See
  // powerAppsUrls.ts's file comment for why these two key *names* are reused, not redefined.
  const [taskUrls, setTaskUrls] = React.useState<IPowerAppsTaskUrls>(EMPTY_TASK_URLS);
  React.useEffect(() => {
    readPowerAppsTaskUrls(devSettingsService)
      .then(setTaskUrls)
      .catch(() => setTaskUrls(EMPTY_TASK_URLS));
  }, [devSettingsService]);

  // "Create New Task" embeds the Power Apps creation form; "View Details" embeds the Power Apps
  // task-detail form for the selected task (its `{taskId}` substituted). Both open in an in-app
  // iframe overlay (PowerAppsFormModal) rather than a separate browser tab, with an "open in new
  // tab" fallback inside the overlay. Query params are best-effort pre-fill (see powerAppsUrls.ts).
  const openTaskForm = (): void => {
    if (!taskUrls.taskFormUrl) return;
    setEmbeddedForm({
      url: buildTaskFormUrl(taskUrls.taskFormUrl, currentUser?.id),
      title: t('myTasks.newTask'),
      kind: 'create',
    });
  };

  const openTaskDetail = (taskId: string): void => {
    if (!taskUrls.taskDetailUrl) return;
    setEmbeddedForm({
      url: buildTaskDetailUrl(taskUrls.taskDetailUrl, taskId),
      title: t('myTasks.action.viewDetails'),
      kind: 'detail',
    });
  };

  const dismissEmbeddedForm = (): void => {
    const shouldRefreshTasks = embeddedForm?.kind === 'create';
    setEmbeddedForm(undefined);
    if (shouldRefreshTasks) fetchData();
  };

  const confirmDelete = (): void => {
    if (!pendingDelete) return;
    setDeletedIds((prev) => new Set(prev).add(pendingDelete.id));
    setPendingDelete(undefined);
  };

  if (loading && fetchedTasks.length === 0) {
    return (
      <div className={styles.dashboard}>
        <Spinner />
      </div>
    );
  }

  const activeTileFilter = selectedTile ? TILE_PREDICATES[selectedTile] : TILE_PREDICATES.all;
  const query = searchQuery.trim().toLowerCase();
  const matchesSearch = (task: ITask): boolean =>
    !query ||
    task.subject.toLowerCase().indexOf(query) !== -1 ||
    task.assignee.toLowerCase().indexOf(query) !== -1;

  const gridRows = tasks.filter((task) => activeTileFilter(task) && matchesSearch(task));
  const countFor = (id: TileFilterId): number => tasks.filter(TILE_PREDICATES[id]).length;

  const noDetailUrlTooltip = t('myTasks.action.viewDetailsDisabled');

  // Every badge on this screen (table cell, log card, queue card) renders the same way from
  // the same config shape, so it is resolved in one place.
  const badge = (cfg: ITaskBadgeConfig): React.ReactElement => (
    <StatusBadge label={t(cfg.labelKey)} tone={cfg.tone} />
  );
  const attachmentNode = (task: ITask): React.ReactNode =>
    task.hasAttachment ? (
      <Icon name="fileText" size={14} aria-label={t('myTasks.field.attachment')} />
    ) : (
      <span style={{ color: 'var(--corms-text-secondary)' }}>—</span>
    );

  const columns: DataGridColumn<ITask>[] = [
    {
      field: 'subject',
      headerKey: 'myTasks.col.subject',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => <span className={styles.tableSubject}>{row.subject}</span>,
    },
    {
      field: 'type',
      headerKey: 'myTasks.col.type',
      filter: 'text',
      width: 150,
      cellRenderer: (row) => badge(taskTypeConfig(row.type)),
    },
    {
      field: 'priority',
      headerKey: 'myTasks.col.priority',
      filter: 'text',
      width: 110,
      cellRenderer: (row) => badge(taskPriorityConfig(row.priority)),
    },
    {
      field: 'status',
      headerKey: 'myTasks.col.status',
      filter: 'text',
      width: 120,
      cellRenderer: (row) => badge(taskStatusConfig(row.status)),
    },
    {
      field: 'dueDate',
      headerKey: 'myTasks.col.dueDate',
      filter: 'date',
      width: 130,
      cellRenderer: (row) => (
        <span style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>
          {formatCardDate(row.dueDate)}
        </span>
      ),
    },
    {
      field: 'assignee',
      headerKey: 'myTasks.col.assignee',
      filter: 'text',
      width: 150,
    },
    {
      field: 'hasAttachment',
      headerKey: 'myTasks.col.attachment',
      filter: false,
      sortable: false,
      width: 110,
      cellRenderer: attachmentNode,
    },
    {
      field: 'id',
      headerKey: 'myTasks.col.actions',
      filter: false,
      sortable: false,
      width: 70,
      cellRenderer: (row) => (
        <ActionsMenu
          items={buildRowActions(
            row,
            taskUrls.taskDetailUrl,
            openTaskDetail,
            setPendingDelete,
            noDetailUrlTooltip
          )}
          ariaLabelKey="myTasks.actions"
        />
      ),
    },
  ];

  const csvColumns: ICsvColumn<ITask>[] = [
    { header: t('myTasks.col.subject'), accessor: (row) => row.subject },
    { header: t('myTasks.col.type'), accessor: (row) => t(taskTypeConfig(row.type).labelKey) },
    { header: t('myTasks.col.priority'), accessor: (row) => t(taskPriorityConfig(row.priority).labelKey) },
    { header: t('myTasks.col.status'), accessor: (row) => t(taskStatusConfig(row.status).labelKey) },
    { header: t('myTasks.col.dueDate'), accessor: (row) => row.dueDate },
    { header: t('myTasks.col.assignee'), accessor: (row) => row.assignee },
    { header: t('myTasks.col.attachment'), accessor: (row) => (row.hasAttachment ? 'Y' : 'N') },
  ];

  const taskFields = (task: ITask): ICorrespondenceCardField[] => [
    { label: t('myTasks.field.type'), node: badge(taskTypeConfig(task.type)) },
    { label: t('myTasks.field.priority'), node: badge(taskPriorityConfig(task.priority)) },
    { label: t('myTasks.field.status'), node: badge(taskStatusConfig(task.status)) },
    { label: t('myTasks.field.dueDate'), node: formatCardDate(task.dueDate) },
    { label: t('myTasks.field.assignee'), node: <TaskAssigneeAvatars assignees={task.assignees} /> },
    { label: t('myTasks.field.attachment'), node: attachmentNode(task) },
  ];

  const cardRenderer = (row: ITask): React.ReactNode => (
    <CorrespondenceCard
      subject={row.subject}
      actions={
        <ActionsMenu
          items={buildRowActions(
            row,
            taskUrls.taskDetailUrl,
            openTaskDetail,
            setPendingDelete,
            noDetailUrlTooltip
          )}
          ariaLabelKey="myTasks.actions"
        />
      }
      fields={taskFields(row)}
    />
  );

  const queueItems = tasks.filter((task) => task.isMine && QUEUE_STATUSES.indexOf(task.status) !== -1);

  return (
    <div className={styles.dashboard}>
      {/* Summary tiles */}
      <div className={styles.kpiRow}>
        {TILE_CARDS.map((tile) => (
          <SummaryTile
            key={tile.id}
            label={t(tile.labelKey)}
            value={countFor(tile.id)}
            color={tile.color}
            iconName={tile.iconName}
            selected={selectedTile === tile.id}
            onClick={() => setSelectedTile((prev) => (prev === tile.id ? undefined : tile.id))}
          />
        ))}
      </div>

      {/* Master Task Log */}
      <div className={styles.logCard}>
        <DataGrid<ITask>
          columns={columns}
          rows={gridRows}
          loading={loading}
          onRefresh={fetchData}
          getRowId={(row) => row.id}
          onRowClick={(row) => openTaskDetail(row.id)}
          defaultViewMode="cards"
          enableViewToggle={true}
          cardRenderer={cardRenderer}
          pageSizeOptions={[10, 20, 50]}
          gridId="my-tasks"
          emptyStateKey="myTasks.noItems"
          toolbarTitle={t('myTasks.masterLog')}
          onFilteredRowsChange={setVisibleRows}
          toolbarLeftActions={
            <>
              <button
                type="button"
                className={gridStyles.gridToolbarBtnPrimary}
                onClick={openTaskForm}
                disabled={!taskUrls.taskFormUrl}
                title={taskUrls.taskFormUrl ? undefined : t('myTasks.newTaskDisabled')}
              >
                <Icon name="plus" size={14} />
                <span>{t('myTasks.newTask')}</span>
              </button>
              <SearchBox
                value={searchQuery}
                placeholder={t('myTasks.searchPlaceholder')}
                onChange={setSearchQuery}
              />
            </>
          }
          toolbarRightActions={
            <button
              type="button"
              className={gridStyles.gridToolbarBtn}
              title={t('myTasks.exportCsv')}
              onClick={() => exportRowsToCsv(visibleRows, csvColumns, 'my-tasks.csv')}
            >
              <Icon name="download" size={14} />
              <span>{t('myTasks.exportCsv')}</span>
            </button>
          }
        />
      </div>

      {/* My Task Queue */}
      <div className={styles.logCard}>
        <div className={styles.queueHeader}>
          <h2 className={styles.queueTitle}>{t('myTasks.queue.title', { count: queueItems.length })}</h2>
        </div>
        {queueItems.length === 0 ? (
          <div className={styles.queueEmpty}>{t('myTasks.queue.empty')}</div>
        ) : (
          <div
            className={`${gridStyles.cardsGrid} ${
              isRailExpanded ? gridStyles.cardsGridNarrow : gridStyles.cardsGridWide
            }`}
          >
            {queueItems.map((task) => (
              <div key={task.id} className={styles.queueItem}>
                <CorrespondenceCard
                  subject={task.subject}
                  fields={taskFields(task).slice(0, QUEUE_CARD_FIELD_COUNT)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <PowerAppsFormModal
        isOpen={!!embeddedForm}
        url={embeddedForm?.url ?? ''}
        title={embeddedForm?.title ?? ''}
        onDismiss={dismissEmbeddedForm}
        onSubmitted={dismissEmbeddedForm}
      />

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={t('myTasks.deleteConfirm.title')}
        message={t('myTasks.deleteConfirm.message', { subject: pendingDelete?.subject ?? '' })}
        confirmLabel={t('myTasks.deleteConfirm.confirm')}
        cancelLabel={t('myTasks.deleteConfirm.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(undefined)}
      />
    </div>
  );
};

export default MyTasksView;

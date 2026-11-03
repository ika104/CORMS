import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ICorrespondenceStub,
  CorrespondenceStatus,
  IAwaitedParty,
  SECURITY_TIERS,
  STATUS_CONFIG,
} from '../../models/ICorrespondence';
import { useServices, useNav } from '../../state/hooks';
import { Icon } from '../../components/icons/Icon';
import { Spinner } from '../../components/common/Spinner';
import { ActionsMenu, IActionsMenuItem } from '../../components/common/ActionsMenu';
import { ActionCommentModal } from '../../components/common/ActionCommentModal';
import { WorkQueuePanel } from '../workQueue/WorkQueuePanel';
import { SummaryTile } from '../../components/common/SummaryTile';
import { SearchBox } from '../../components/common/SearchBox';
import { Button } from '../../components/common/Button';
import { CorrespondenceFlagBadges } from '../../components/common/CorrespondenceFlagBadges';
import { useEscalationDays } from '../pendingResponse/useEscalationDays';
import { useSlaConfig } from '../notifications/useSlaConfig';
import { formatCardDateTime } from '../../utils/formatDateTime';
import { FlagPendingResponseModal } from '../../components/common/FlagPendingResponseModal';
import { ExpediteReasonModal } from '../../components/common/ExpediteReasonModal';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { useServerGrid } from '../../components/grid/useServerGrid';
import { exportRowsToCsv, ICsvColumn } from '../../utils/exportCsv';
import { buildCorrespondenceRowActions } from '../../utils/correspondenceRowActions';
import {
  applyClearPendingResponse,
  applyExpedite,
  applyFlagPendingResponse,
  applyRemoveExpedite,
  buildFlagActionItems,
  expediteSortWeight,
  IFlagActionHandlers,
} from '../../utils/correspondenceFlags';
import { IUser } from '../../models/IUser';
import styles from './MyCorrespondenceView.module.scss';
import gridStyles from '../../components/grid/DataGrid.module.scss';

// ─── Micro-components ───────────────────────────────────────────────────────

// Client feedback: the cards carried too much colour. Status and Security are drawn as plain
// neutral labels — no pill background or border — only the Expedited flag stays coloured (see
// CorrespondenceFlagBadges). The label still comes from STATUS_CONFIG / SECURITY_TIERS.
const PLAIN_TAG_STYLE: React.CSSProperties = { color: '#605e5c', background: 'transparent', border: 'none', padding: 0 };

function StatusBadge({ status }: { status: CorrespondenceStatus }): React.ReactElement {
  return (
    <span className={styles.badge} style={PLAIN_TAG_STYLE}>
      {STATUS_CONFIG[status]?.label ?? status}
    </span>
  );
}

// eslint-disable-next-line @rushstack/no-new-null
function TierBadge({ tier }: { tier: number }): React.ReactElement | null {
  const found = SECURITY_TIERS.find((x) => x.tier === tier);
  if (!found) return null;
  return (
    <span className={styles.badge} style={PLAIN_TAG_STYLE}>
      {found.name}
    </span>
  );
}

// ─── Row actions ────────────────────────────────────────────────────────────

// The row "…" menu is the shared, Figma-ordered correspondence action set (View Details, Open Full
// Preview, Edit in Word Online, Reply, Forward, Share Link, Download, Print, Annotate, View
// Attachments, View Timeline, Approve, Reject, Reassign/Route, Set Reminder, Delegate) — each action
// opens the detail view on the matching tab (Reply/Forward go to compose), gated by direction/status
// and role. The expedite / pending-response flag actions are appended after it.
function buildRowActions(
  row: ICorrespondenceStub,
  navigate: ReturnType<typeof useNavigate>,
  originLabel: string,
  currentUser: IUser | undefined,
  flagHandlers: IFlagActionHandlers<ICorrespondenceStub>,
  onDeleteDraft: (row: ICorrespondenceStub) => void
): IActionsMenuItem[] {
  const items = buildCorrespondenceRowActions(row, {
    navigate,
    originState: { originPath: '/my-correspondence', originLabel },
    currentUser,
    // My Correspondence can include another user's work within the viewer's clearance. Only the
    // requestor gets the destructive Draft action on this broad dashboard.
    onDeleteDraft: row.senderName && row.senderName === currentUser?.displayName ? onDeleteDraft : undefined,
  });
  return [...items, ...buildFlagActionItems(row, currentUser, flagHandlers)];
}

// ─── KPI filters ────────────────────────────────────────────────────────────

type KpiFilterId = 'all' | 'pending' | 'overdue' | 'mine';

// Single source of truth: each predicate drives both the KPI's count and the row filter,
// so the number on the card can never drift from the rows the card selects.
//
// Part 4 (Create Correspondence backend task) redefines Pending/Overdue/Mine to match the real
// tile semantics the backend task specifies, replacing the earlier pendingResponse-based
// predicates: Pending = Status in [Registered, InReview]; Overdue = has a past DueDate and isn't
// already Delivered/Declared; Mine = Sender is the current user. TODO(confirm): "Mine" compares
// senderName against currentUser.displayName (a display-name match, not an id match) since
// ICorrespondenceStub carries no stable sender id — revisit once one exists.
function buildKpiPredicates(currentUser: IUser | undefined): Record<KpiFilterId, (item: ICorrespondenceStub) => boolean> {
  const todayIso = new Date().toISOString().slice(0, 10);
  return {
    all: () => true,
    pending: (i) => i.status === 'Registered' || i.status === 'InReview',
    overdue: (i) => !!i.dueDate && i.dueDate < todayIso && i.status !== 'Delivered' && i.status !== 'Declared',
    mine: (i) => !!currentUser && i.senderName === currentUser.displayName,
  };
}

// Accent colours are per-KPI semantics (neutral/info/danger/success), not theme tokens,
// so they stay as literals — collected here rather than scattered across the markup.
// Client feedback ("too much colour"): every tile's accent follows the single SharePoint site
// theme colour (--corms-toolbar-primary, which tracks "Change the look") instead of a per-tile
// hue, so the KPI row reads as one accent rather than four.
const KPI_ACCENT = 'var(--corms-toolbar-primary)';
const KPI_CARDS: { id: KpiFilterId; labelKey: string; color: string; iconName: string }[] = [
  { id: 'all', labelKey: 'myCorrespondence.kpi.all', color: KPI_ACCENT, iconName: 'users' },
  { id: 'pending', labelKey: 'myCorrespondence.kpi.pending', color: KPI_ACCENT, iconName: 'inbox' },
  {
    id: 'overdue',
    labelKey: 'myCorrespondence.kpi.overdue',
    color: KPI_ACCENT,
    iconName: 'alertTriangle',
  },
  { id: 'mine', labelKey: 'myCorrespondence.kpi.mine', color: KPI_ACCENT, iconName: 'userCog' },
];

// ─── Helper: flatten chain groups to one row per chain ──────────────────────

function groupByChain(items: ICorrespondenceStub[]): ICorrespondenceStub[] {
  const grouped: Record<string, ICorrespondenceStub[]> = {};
  items.forEach((item) => {
    const key = item.chainId || item.id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  const keys = Object.keys(grouped);
  return keys
    .map((k: string) => {
      const chain = grouped[k];
      chain.sort((a: ICorrespondenceStub, b: ICorrespondenceStub) => b.createdAt.localeCompare(a.createdAt));
      // CMS-022 AC5 — one row per chain (the most recent item), carrying the count of items it holds.
      return { ...chain[0], chainCount: chain.length };
    })
    .sort((a: ICorrespondenceStub, b: ICorrespondenceStub) => {
      // Expedited items sort first (CMS-015), same sort-priority mechanism as signature-first
      // sorting elsewhere (CMS-047), chained ahead of the existing recency sort.
      const expediteDiff = expediteSortWeight(a) - expediteSortWeight(b);
      if (expediteDiff !== 0) return expediteDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

// ─── Main view ──────────────────────────────────────────────────────────────

const MyCorrespondenceView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { correspondenceDashboardService, bulkActionsService, auditTrailService } = useServices();
  // CMS-014 AC4 — configured escalation deadline for the pending-response badge.
  const escalationDays = useEscalationDays();
  // CMS-015 AC4 — the shortened escalation window applied to expedited items.
  const slaConfig = useSlaConfig();
  const { currentUser } = useNav();

  // TODO(confirm): drill-down interaction not shown in current Figma capture — added per story
  // text (CMS-032). Statistics BI's "By Department" chart navigates here with this state.
  const drillDownState = location.state as { departmentFilter?: string } | null;
  const [departmentFilter, setDepartmentFilter] = React.useState<string | undefined>(drillDownState?.departmentFilter);

  // undefined = no KPI selected, which shows everything (same rows as the "all" card).
  const [selectedFilter, setSelectedFilter] = React.useState<KpiFilterId | undefined>(undefined);
  // Mirrors whatever the grid currently has on screen (post column-filter/sort) so Export
  // CSV exports what the user is actually looking at, not the full unfiltered set.
  const [visibleRows, setVisibleRows] = React.useState<ICorrespondenceStub[]>([]);
  const [flagTarget, setFlagTarget] = React.useState<ICorrespondenceStub | undefined>(undefined);
  const [expediteTarget, setExpediteTarget] = React.useState<ICorrespondenceStub | undefined>(undefined);
  const [pendingDeleteDraft, setPendingDeleteDraft] = React.useState<ICorrespondenceStub | undefined>(undefined);
  const [search, setSearch] = React.useState('');

  // Real CORMS_Correspondence data when app.correspondenceDataSource is live, the earlier UI
  // task's bundled mock dataset when mock (App.tsx's ResolvedServiceProvider already resolved
  // which one this is) — routed through the same useServerGrid layer the EPIC 14 grid task built
  // (CMS-044), this screen's first real consumer of it.
  const {
    rows: fetchedItems,
    loading,
    refresh: fetchData,
  } = useServerGrid<ICorrespondenceStub>({
    cacheNamespace: 'my-correspondence',
    cacheKey: 'all',
    queryFn: () => correspondenceDashboardService.getAll(),
    deps: [correspondenceDashboardService],
  });
  // Local optimistic patches (flag/expedite) layer on top of the fetched page, same as the
  // previous items state did — not persisted server-side by this task (out of scope, see
  // applyFlagPendingResponse/applyExpedite's own call sites).
  const [localPatches, setLocalPatches] = React.useState<Record<string, Partial<ICorrespondenceStub>>>({});
  const [deletedIds, setDeletedIds] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    setLocalPatches({});
    setDeletedIds(new Set());
  }, [fetchedItems]);
  // Memoized, not recomputed per render: DataGrid's own row mirror (sameRows) is a per-element
  // `===` check, so a fresh array of fresh row objects on every render — even with identical
  // content — reads as "everything changed", which re-triggers onFilteredRowsChange, which
  // re-renders this component, which would recompute `items` again — an infinite loop. Only
  // recomputing when fetchedItems/localPatches actually change keeps row identity stable
  // between unrelated re-renders (search text, KPI selection, etc.).
  const items = React.useMemo(
    () => fetchedItems.filter((i) => !deletedIds.has(i.id)).map((i) => ({ ...i, ...localPatches[i.id] })),
    [fetchedItems, localPatches, deletedIds]
  );

  // Grouped rows are memoized for the SAME reason `items` is: groupByChain builds fresh row objects
  // (it attaches chainCount), so recomputing it every render would hand DataGrid new references each
  // time — read as "everything changed", re-firing onFilteredRowsChange and looping. Keyed on the
  // real inputs, the grouped array + its objects stay stable between unrelated re-renders.
  const gridRows = React.useMemo(() => {
    const predicates = buildKpiPredicates(currentUser);
    const active = selectedFilter ? predicates[selectedFilter] : predicates.all;
    const term = search.trim().toLowerCase();
    const matchesSearch = (item: ICorrespondenceStub): boolean =>
      !term ||
      item.subject.toLowerCase().indexOf(term) !== -1 ||
      (item.referenceNumber || '').toLowerCase().indexOf(term) !== -1;
    const matchesDept = (item: ICorrespondenceStub): boolean => !departmentFilter || item.department === departmentFilter;
    return groupByChain(items.filter((i) => active(i) && matchesSearch(i) && matchesDept(i)));
  }, [items, selectedFilter, search, departmentFilter, currentUser]);

  const updateItemById = (id: string, patch: Partial<ICorrespondenceStub>): void =>
    setLocalPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const confirmDeleteDraft = (comment: string): void => {
    if (!pendingDeleteDraft) return;
    const id = pendingDeleteDraft.id;
    const ref = pendingDeleteDraft.referenceNumber || pendingDeleteDraft.subject;
    setPendingDeleteDraft(undefined);
    bulkActionsService
      .deleteDrafts([id])
      .then((result) => {
        if (result.succeeded.indexOf(id) !== -1) {
          setDeletedIds((prev) => new Set([...Array.from(prev), id]));
          // The mandatory delete comment is recorded in the audit trail.
          auditTrailService
            .logEvent({
              objectId: id,
              actor: currentUser?.displayName ?? 'Unknown',
              action: 'Draft Deleted',
              details: `Deleted draft ${ref} — ${comment}`,
              timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  };

  const handleFlagPendingResponse = (awaitedParty: IAwaitedParty): void => {
    if (!flagTarget) return;
    updateItemById(flagTarget.id, applyFlagPendingResponse(flagTarget, awaitedParty, currentUser?.displayName ?? 'Unknown'));
    setFlagTarget(undefined);
  };
  const handleClearPendingResponse = (id: string): void => updateItemById(id, applyClearPendingResponse());
  // CMS-015 AC5/AC6 — expedite set + removal are persisted server-side (role-gated + audited), then
  // the dashboard is optimistically patched for the rows the service actioned.
  const auditExpedite = (action: string, details: string): void => {
    auditTrailService
      .logEvent({
        objectId: 'CorrespondenceActions',
        actor: currentUser?.displayName ?? 'Unknown',
        action,
        details,
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      })
      .catch(() => undefined);
  };
  const handleConfirmExpedite = (reason: string): void => {
    if (!expediteTarget) return;
    const id = expediteTarget.id;
    setExpediteTarget(undefined);
    bulkActionsService
      .expedite([id], reason)
      .then((result) => {
        if (result.succeeded.indexOf(id) === -1) return;
        updateItemById(id, applyExpedite(reason, currentUser?.displayName ?? 'Unknown'));
        auditExpedite('Expedited', `Expedited ${id} — ${reason}`);
      })
      .catch(() => undefined);
  };
  const handleRemoveExpedite = (id: string): void => {
    bulkActionsService
      .removeExpedite([id])
      .then((result) => {
        if (result.succeeded.indexOf(id) === -1) return;
        updateItemById(id, applyRemoveExpedite());
        auditExpedite('Expedite Removed', `Expedite removed from ${id}`);
      })
      .catch(() => undefined);
  };
  const flagHandlers: IFlagActionHandlers<ICorrespondenceStub> = {
    onFlagPendingResponse: setFlagTarget,
    onClearPendingResponse: handleClearPendingResponse,
    onExpedite: setExpediteTarget,
    onRemoveExpedite: handleRemoveExpedite,
  };

  if (loading && items.length === 0) {
    return (
      <div className={styles.dashboard}>
        <Spinner />
      </div>
    );
  }

  const kpiPredicates = buildKpiPredicates(currentUser);
  const countFor = (id: KpiFilterId): number => items.filter(kpiPredicates[id]).length;

  const columns: DataGridColumn<ICorrespondenceStub>[] = [
    {
      field: 'referenceNumber',
      headerKey: 'myCorrespondence.col.refNo',
      filter: 'text',
      width: 140,
      cellRenderer: (row) => <span className={styles.tableRefNo}>{row.referenceNumber || '—'}</span>,
    },
    {
      field: 'subject',
      headerKey: 'myCorrespondence.col.subject',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => (
        <span className={styles.tableSubject}>
          {row.subject}
          {/* CMS-022 AC5 — count of items in this chain, shown on the single grouped row. */}
          {row.chainCount && row.chainCount > 1 && (
            <span className={styles.threadCount}>
              <Icon name="link" size={11} /> {t('myCorrespondence.threadCount', { count: row.chainCount })}
            </span>
          )}
          <CorrespondenceFlagBadges item={row} badgeClassName={styles.inlineBadge} escalationDays={escalationDays} expeditedEscalationDays={slaConfig.expeditedDays} />
        </span>
      ),
    },
    {
      field: 'senderName',
      headerKey: 'myCorrespondence.col.fromTo',
      filter: 'text',
      width: 150,
      cellRenderer: (row) => (
        <span style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>
          {row.senderName || row.recipientName || '—'}
        </span>
      ),
    },
    {
      field: 'securityTier',
      headerKey: 'myCorrespondence.col.security',
      filter: 'number',
      width: 130,
      cellRenderer: (row) => <TierBadge tier={row.securityTier} />,
    },
    {
      field: 'status',
      headerKey: 'myCorrespondence.col.status',
      filter: 'text',
      width: 110,
      cellRenderer: (row) => <StatusBadge status={row.status} />,
    },
    {
      field: 'createdAt',
      headerKey: 'myCorrespondence.col.date',
      filter: 'date',
      width: 150,
      cellRenderer: (row) => (
        <span style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>{formatCardDateTime(row.createdAt)}</span>
      ),
    },
    {
      field: 'id',
      headerKey: 'myCorrespondence.col.actions',
      filter: false,
      sortable: false,
      width: 70,
      cellRenderer: (row) => (
        <ActionsMenu
          items={buildRowActions(row, navigate, t('myCorrespondence.masterLog'), currentUser, flagHandlers, setPendingDeleteDraft)}
          ariaLabelKey="myCorrespondence.actions"
        />
      ),
    },
  ];

  const csvColumns: ICsvColumn<ICorrespondenceStub>[] = [
    { header: t('myCorrespondence.col.refNo'), accessor: (row) => row.referenceNumber || '' },
    { header: t('myCorrespondence.col.subject'), accessor: (row) => row.subject },
    { header: t('myCorrespondence.col.fromTo'), accessor: (row) => row.senderName || row.recipientName || '' },
    { header: t('myCorrespondence.col.security'), accessor: (row) => String(row.securityTier) },
    { header: t('myCorrespondence.col.status'), accessor: (row) => STATUS_CONFIG[row.status]?.label ?? row.status },
    { header: t('myCorrespondence.col.date'), accessor: (row) => row.createdAt },
  ];

  const cardRenderer = (row: ICorrespondenceStub): React.ReactNode => (
    <div className={styles.corrCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardSubject}>{row.subject}</div>
          <div className={styles.cardRefNo}>
            {row.referenceNumber || t('myCorrespondence.draftNotRegistered')}
          </div>
          {(row.expedited || row.pendingResponse) && (
            <div className={styles.cardBadgesRow}>
              <CorrespondenceFlagBadges item={row} escalationDays={escalationDays} expeditedEscalationDays={slaConfig.expeditedDays} />
            </div>
          )}
        </div>
        <ActionsMenu
          items={buildRowActions(row, navigate, t('myCorrespondence.masterLog'), currentUser, flagHandlers, setPendingDeleteDraft)}
          ariaLabelKey="myCorrespondence.actions"
        />
      </div>
      <div className={styles.cardBody}>
        <div>
          <div className={styles.cardFieldLabel}>{t('myCorrespondence.field.type')}</div>
          <div className={styles.cardFieldValue}>{row.type}</div>
        </div>
        <div>
          <div className={styles.cardFieldLabel}>{t('myCorrespondence.field.status')}</div>
          <StatusBadge status={row.status} />
        </div>
        <div>
          <div className={styles.cardFieldLabel}>{t('myCorrespondence.field.security')}</div>
          <TierBadge tier={row.securityTier} />
        </div>
        <div>
          <div className={styles.cardFieldLabel}>{t('myCorrespondence.field.date')}</div>
          <div className={styles.cardFieldValue}>{formatCardDateTime(row.createdAt)}</div>
        </div>
      </div>
      {row.signatureRequired && (
        <div className={styles.cardFooter}>
          <button
            type="button"
            className={styles.signatureBtn}
            style={{ color: row.isSigned ? '#059669' : '#0070d0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className={styles.signatureCheckbox}
              style={{
                borderColor: row.isSigned ? '#059669' : '#0070d0',
                background: row.isSigned ? '#059669' : 'transparent',
                color: row.isSigned ? '#fff' : '#0070d0',
              }}
            >
              {row.isSigned ? '✓' : ''}
            </span>
            {row.isSigned ? t('myCorrespondence.signed') : t('myCorrespondence.signatureRequired')}
          </button>
        </div>
      )}
      {/* CMS-022 AC5 — thread item count, shown as a footer indicator (Figma). */}
      {row.chainCount && row.chainCount > 1 && (
        <div className={styles.threadFooter}>
          <span className={styles.threadToggle} aria-hidden="true">
            <Icon name="chevronRight" size={12} />
          </span>
          {t('myCorrespondence.threadCount', { count: row.chainCount })}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.dashboard}>
      {/* KPI row */}
      <div className={styles.kpiRow}>
        {KPI_CARDS.map((card) => (
          <SummaryTile
            key={card.id}
            label={t(card.labelKey)}
            value={countFor(card.id)}
            color={card.color}
            iconName={card.iconName}
            selected={selectedFilter === card.id}
            onClick={() => setSelectedFilter((prev) => (prev === card.id ? undefined : card.id))}
          />
        ))}
      </div>

      {/* Master Correspondence Log */}
      <div className={styles.logCard}>
        <DataGrid<ICorrespondenceStub>
          columns={columns}
          rows={gridRows}
          loading={loading}
          onRefresh={fetchData}
          getRowId={(row) => row.chainId || row.id}
          onRowClick={(row) => {
            const originState = { originPath: '/my-correspondence', originLabel: t('myCorrespondence.masterLog') };
            if (row.status === 'Draft') {
              navigate('/correspondence/new', { state: { editDraftId: row.id, ...originState } });
              return;
            }
            navigate(`/correspondence/${row.id}`, { state: { tab: 'preview', ...originState } });
          }}
          defaultViewMode="cards"
          enableViewToggle={true}
          cardRenderer={cardRenderer}
          gridId="my-correspondence"
          emptyStateKey="myCorrespondence.noItems"
          toolbarTitle={t('myCorrespondence.masterLog')}
          onFilteredRowsChange={setVisibleRows}
          toolbarLeftActions={
            <>
              <button
                type="button"
                className={gridStyles.gridToolbarBtnPrimary}
                onClick={() => navigate('/correspondence/new')}
              >
                <Icon name="plus" size={14} />
                <span>{t('myCorrespondence.newCorrespondence')}</span>
              </button>
              <SearchBox value={search} placeholder={t('myCorrespondence.searchPlaceholder')} onChange={setSearch} />
              {/* TODO(confirm): hands off to the shared Elastic Search screen rather than an
                  inline advanced-search panel — same convention Triage & Routing's own
                  "Advanced Search" button uses. */}
              <Button onClick={() => navigate('/search')}>{t('myCorrespondence.advancedSearch')}</Button>
              {/* "Groups: N" — confirms items are grouped by chain (CMS-022's "one row per
                  chain" requirement); N is gridRows.length since groupByChain already
                  collapsed each chain down to one row. */}
              <span className={styles.groupsIndicator}>{t('myCorrespondence.groupsIndicator', { count: gridRows.length })}</span>
              {departmentFilter && (
                <button type="button" className={styles.departmentChip} onClick={() => setDepartmentFilter(undefined)}>
                  {t('myCorrespondence.departmentFilter', { department: departmentFilter })}
                  <Icon name="x" size={12} />
                </button>
              )}
            </>
          }
          toolbarRightActions={
            <button
              type="button"
              className={gridStyles.gridToolbarBtn}
              title={t('myCorrespondence.exportCsv')}
              onClick={() => exportRowsToCsv(visibleRows, csvColumns, 'my-correspondence.csv')}
            >
              <Icon name="download" size={14} />
              <span>{t('myCorrespondence.exportCsv')}</span>
            </button>
          }
        />
      </div>

      {/* CMS-013 — the personal Work Queue (AC4: surfaced on the dashboard), shared with the
          triage screen. Filtering (clearance/holder/actionable), the named next step, the display
          fields, unread styling and the priority-then-date sort all live in the shared panel. */}
      <WorkQueuePanel
        items={items}
        // AC4 — the dashboard queue must show the SAME items as the triage queue. holdsLiveStep
        // matches item.assignedTo (= AssignedTo.Title, a display name) against this userId, so it
        // must be the current user's display name — matching TriageRoutingView. The old 'u-admin'
        // constant never matched a real assignee, so the dashboard queue was always empty.
        userId={currentUser?.displayName ?? ''}
        maxClearanceTier={currentUser?.clearanceTier ?? 1}
        onOpen={(item) =>
          navigate(`/correspondence/${item.id}`, {
            state: { tab: 'details', originPath: '/my-correspondence', originLabel: t('myCorrespondence.masterLog') },
          })
        }
      />

      <FlagPendingResponseModal
        isOpen={!!flagTarget}
        onDismiss={() => setFlagTarget(undefined)}
        onFlag={handleFlagPendingResponse}
      />
      <ExpediteReasonModal
        isOpen={!!expediteTarget}
        targetCount={expediteTarget ? 1 : 0}
        onDismiss={() => setExpediteTarget(undefined)}
        onConfirm={handleConfirmExpedite}
      />
      <ActionCommentModal
        isOpen={!!pendingDeleteDraft}
        title={t('inboxSent.bulk.deleteConfirmTitle')}
        confirmText={t('inboxSent.bulk.deleteConfirm')}
        confirmTone="danger"
        onConfirm={confirmDeleteDraft}
        onDismiss={() => setPendingDeleteDraft(undefined)}
      />
    </div>
  );
};

export default MyCorrespondenceView;

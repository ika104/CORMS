import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCardDateTime } from '../../utils/formatDateTime';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ICorrespondenceStub,
  IAwaitedParty,
  SECURITY_TIERS,
  STATUS_CONFIG,
  correspondenceStatusTone,
} from '../../models/ICorrespondence';
import { IUserFolder } from '../../models/IFolder';
import { IRecordClassification } from '../../models/ICorrespondenceMetadata';
import { useServices, useFolders, useNav } from '../../state/hooks';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { Icon } from '../../components/icons/Icon';
import { Spinner } from '../../components/common/Spinner';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ActionsMenu, IActionsMenuItem } from '../../components/common/ActionsMenu';
import { CorrespondenceCard, ICorrespondenceCardField } from '../../components/common/CorrespondenceCard';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { CorrespondenceFlagBadges } from '../../components/common/CorrespondenceFlagBadges';
import { useEscalationDays } from '../pendingResponse/useEscalationDays';
import { useSlaConfig } from '../notifications/useSlaConfig';
import { FlagPendingResponseModal } from '../../components/common/FlagPendingResponseModal';
import { ExpediteReasonModal } from '../../components/common/ExpediteReasonModal';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { useServerGrid } from '../../components/grid/useServerGrid';
import { exportRowsToCsv, ICsvColumn } from '../../utils/exportCsv';
import { buildCorrespondenceRowActions } from '../../utils/correspondenceRowActions';
import { canSignCorrespondence, applySignature } from '../../utils/signature';
import {
  applyClearPendingResponse,
  applyExpedite,
  applyFlagPendingResponse,
  applyRemoveExpedite,
  buildFlagActionItems,
  expediteSortWeight,
  IFlagActionHandlers,
} from '../../utils/correspondenceFlags';
import { SearchBox } from '../../components/common/SearchBox';
import { matchesFolderCriteria, folderCriteriaSummary } from './folderUtils';
import { EMPTY_LIST_FILTERS, hasActiveListFilters, IListFilters, matchesListFilters } from './listFilters';
import { CreateFolderModal } from './components/CreateFolderModal';
import { PinToFolderModal } from './components/PinToFolderModal';
import gridStyles from '../../components/grid/DataGrid.module.scss';
import styles from './InboxSentView.module.scss';

// Same fallback the Create Correspondence form already uses when no identity service is
// wired (mock mode) — see CreateCorrespondenceView.tsx.
const DEFAULT_MAX_CLEARANCE = 1;

type Tab = 'inbox' | 'sent' | 'drafts';
type QuickFilter = 'all' | 'unread' | 'high';

interface IInboxRow extends ICorrespondenceStub {
  /** Derived text the Signature column's floating filter operates on ("Required"/"Signed"/""). */
  signatureFilterValue: string;
}

const FOLDER_LABEL_KEY: Record<Tab, string> = {
  inbox: 'inboxSent.folder.inbox',
  sent: 'inboxSent.folder.sent',
  drafts: 'inboxSent.folder.drafts',
};

// Client feedback: cards carried too much colour — Security is drawn as a plain neutral label
// (no pill background or border). Only the label comes from SECURITY_TIERS.
// eslint-disable-next-line @rushstack/no-new-null
function TierBadge({ tier }: { tier: number }): React.ReactElement | null {
  const found = SECURITY_TIERS.find((x) => x.tier === tier);
  if (!found) return null;
  return (
    <span className={styles.badge} style={{ color: '#605e5c', background: 'transparent', border: 'none', padding: 0 }}>
      {found.name}
    </span>
  );
}

function parseRoute(pathname: string): { tab: Tab; folderId?: string } {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[1] === 'folder' && segments[2]) return { tab: 'inbox', folderId: segments[2] };
  const tab = segments[1] === 'sent' || segments[1] === 'drafts' ? (segments[1] as Tab) : 'inbox';
  return { tab };
}

const InboxSentView: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { correspondenceListService, readReceiptService, metadataService, bulkActionsService, auditTrailService } = useServices();
  const { currentUser } = useNav();
  const { folders, createFolder, deleteFolder, pinItems, unpinItem } = useFolders();
  // CMS-014 AC4 — configured escalation deadline, so a stale pending flag shows as escalation-due.
  const escalationDays = useEscalationDays();
  // CMS-015 AC4 — the shortened escalation window applied to expedited items.
  const slaConfig = useSlaConfig();

  const { tab, folderId } = parseRoute(location.pathname);
  const activeFolder = folderId ? folders.find((f) => f.id === folderId) : undefined;

  const [recordClassifications, setRecordClassifications] = React.useState<IRecordClassification[]>([]);

  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>('all');
  // CMS-039 AC4/AC5 — free-text search plus the date-range/status/security/team filter row, all
  // cleared by the single "Clear Filters" action below.
  const [listFilters, setListFilters] = React.useState<IListFilters>(EMPTY_LIST_FILTERS);
  const setListFilter = (patch: Partial<IListFilters>): void => setListFilters((prev) => ({ ...prev, ...patch }));

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [bulkFolderMenuOpen, setBulkFolderMenuOpen] = React.useState(false);
  const bulkFolderWrapRef = React.useRef<HTMLDivElement>(null);

  const [createFolderOpen, setCreateFolderOpen] = React.useState(false);
  const [pinItem, setPinItem] = React.useState<IInboxRow | undefined>(undefined);
  const [pendingDeleteDraftIds, setPendingDeleteDraftIds] = React.useState<string[] | undefined>(undefined);
  const [pendingDeleteFolder, setPendingDeleteFolder] = React.useState<IUserFolder | undefined>(undefined);
  const [flagTarget, setFlagTarget] = React.useState<IInboxRow | undefined>(undefined);
  // Single-item Expedite (from the "…" menu) and bulk Expedite (from the selection bar) both
  // land here and share this one modal/handler (CMS-015) — never two implementations.
  const [expediteTargetIds, setExpediteTargetIds] = React.useState<string[] | undefined>(undefined);

  // Real CORMS_Correspondence data when app.correspondenceDataSource is live, the earlier UI
  // task's bundled mock dataset when mock (App.tsx's ResolvedServiceProvider already resolved
  // which service instance this is). A folder is "a saved search over Inbox" (see baseItems
  // below), so it fetches via getInbox() same as the plain inbox tab — not a narrower query.
  const {
    rows: fetchedItems,
    loading,
    refresh: fetchData,
  } = useServerGrid<ICorrespondenceStub>({
    cacheNamespace: 'inbox-sent',
    cacheKey: `${tab}:${folderId ?? ''}`,
    queryFn: () => {
      if (folderId || tab === 'inbox') return correspondenceListService.getInbox();
      if (tab === 'sent') return correspondenceListService.getSent();
      return correspondenceListService.getDrafts();
    },
    deps: [correspondenceListService, tab, folderId],
  });

  // CMS-039's Unread quick filter / subject bolding now reads real per-user read state
  // (CORMS_ReadReceipts) instead of the mock dataset's static `seen` flag.
  const [unreadIds, setUnreadIds] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    if (fetchedItems.length === 0) {
      setUnreadIds(new Set());
      return;
    }
    readReceiptService
      .getUnreadIds(fetchedItems.map((i) => i.id))
      .then(setUnreadIds)
      .catch(() => setUnreadIds(new Set()));
  }, [fetchedItems, readReceiptService]);

  // Local optimistic overlay (flag/expedite/sign/mark-read-unread) on top of the fetched page —
  // this task doesn't persist those actions server-side (out of scope), same as before; deletion
  // (bulk delete drafts) is tracked separately since it removes rather than patches a row.
  const [localPatches, setLocalPatches] = React.useState<Record<string, Partial<ICorrespondenceStub>>>({});
  const [deletedIds, setDeletedIds] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    setLocalPatches({});
    setDeletedIds(new Set());
  }, [fetchedItems]);
  // Memoized, not recomputed per render: DataGrid's own row mirror (sameRows) is a per-element
  // `===` check, so a fresh array of fresh row objects every render — even with identical
  // content — reads as "everything changed", re-triggering onFilteredRowsChange -> a parent
  // re-render -> recomputing `items` again -> an infinite loop. See MyCorrespondenceView.tsx's
  // identical fix for the same reason.
  const items = React.useMemo(
    () =>
      fetchedItems
        .filter((i) => !deletedIds.has(i.id))
        .map((i) => ({ ...i, seen: !unreadIds.has(i.id), ...localPatches[i.id] })),
    [fetchedItems, deletedIds, unreadIds, localPatches]
  );

  React.useEffect(() => {
    metadataService.getRecordClassifications().then(setRecordClassifications).catch(() => setRecordClassifications([]));
  }, [metadataService]);

  // Switching tabs/folders starts a fresh selection and closes any open bulk menu.
  React.useEffect(() => {
    setSelectedIds(new Set());
    setBulkFolderMenuOpen(false);
  }, [tab, folderId]);

  // Same dismissal contract every other popup in the app honours (ActionsMenu,
  // SearchableSelect) — click outside or Escape closes it.
  React.useEffect(() => {
    if (!bulkFolderMenuOpen) return undefined;

    const handlePointerDown = (e: MouseEvent): void => {
      if (bulkFolderWrapRef.current?.contains(e.target as Node)) return;
      setBulkFolderMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setBulkFolderMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [bulkFolderMenuOpen]);

  const maxClearanceTier = currentUser?.clearanceTier ?? DEFAULT_MAX_CLEARANCE;

  const updateItemById = (id: string, patch: Partial<ICorrespondenceStub>): void =>
    setLocalPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const deleteItemsByIds = (ids: string[]): void =>
    setDeletedIds((prev) => new Set([...Array.from(prev), ...ids]));

  // Derived once per `items` change (not per render) and reused by reference thereafter —
  // DataGrid's own row-set mirror is a reference-equality check (per element), so re-deriving
  // a fresh object per row on every render (e.g. from a selection toggle) would look like a
  // brand new row set each time and silently reset pagination back to page 1.
  const allRows = React.useMemo<IInboxRow[]>(
    () =>
      items.map((i) => ({
        ...i,
        signatureFilterValue: !i.signatureRequired ? '' : i.isSigned ? 'Signed' : 'Required',
      })),
    [items]
  );

  if (loading && items.length === 0) {
    return (
      <div className={styles.dashboard}>
        <Spinner />
      </div>
    );
  }

  const clearanceTrimmed = allRows.filter((i) => i.securityTier <= maxClearanceTier);

  // TODO(confirm): reconcile computed-folder-contents rendering + pin/unpin against Figma
  // once that state exists in the prototype.
  const baseItems = clearanceTrimmed.filter((i) => {
    if (activeFolder) {
      // A folder is a saved search *over Inbox*, so it inherits Inbox's own scope — incoming
      // and not a draft — before criteria/pins are considered. Without the draft guard an
      // incoming draft could surface in a folder while being absent from Inbox itself.
      if (i.direction !== 'Incoming' || i.status === 'Draft') return false;
      return matchesFolderCriteria(i, activeFolder.criteria) || activeFolder.manualIds.indexOf(i.id) !== -1;
    }
    if (tab === 'inbox') return i.direction === 'Incoming' && i.status !== 'Draft';
    if (tab === 'sent') return (i.direction === 'Outgoing' || i.direction === 'External') && i.status !== 'Draft';
    return i.status === 'Draft';
  });

  // Free-text + date-range/status/security/team filters (AC4/AC5) narrow the current folder
  // before the tab-style state quick filters (AC6) apply on top.
  const searchFiltered = baseItems.filter((i) => matchesListFilters(i, listFilters));

  const stateFiltered = searchFiltered.filter((i) => {
    if (quickFilter === 'unread' && i.seen !== false) return false;
    if (quickFilter === 'high' && i.priority !== 'High') return false;
    return true;
  });

  // Option lists come from what the user can actually see (clearance-trimmed, current folder), so
  // no filter value can ever be offered that would trivially return nothing.
  const departmentOptions = Array.from(new Set(baseItems.map((i) => i.department).filter(Boolean))).sort();
  const statusOptions = Array.from(new Set(baseItems.map((i) => i.status))).sort();
  const filtersActive = hasActiveListFilters(listFilters);

  // Items awaiting signature sort ahead of already-signed ones (Array.sort is stable, so
  // this is the only "sort logic" needed — the grid's own default sort handles the rest).
  // A plain sort of the already-derived `allRows` elements — no new row objects, so their
  // identity survives from render to render (see `allRows` above).
  const gridRows: IInboxRow[] = [...stateFiltered].sort((a, b) => {
    const expediteDiff = expediteSortWeight(a) - expediteSortWeight(b);
    if (expediteDiff !== 0) return expediteDiff;
    const aPending = a.signatureRequired && !a.isSigned ? 0 : 1;
    const bPending = b.signatureRequired && !b.isSigned ? 0 : 1;
    return aPending - bPending;
  });

  // ── Selection ────────────────────────────────────────────────────────────
  // Ids survive a quick-filter change (flip the filter back and the picks are still there),
  // but every bulk action — and the count the bar reports — is the intersection with what is
  // currently listed. Reporting `selectedIds.size` instead would promise the user actions
  // over rows the buttons can't reach, and let Delete reach rows the other buttons don't.
  const selectedList = gridRows.filter((r) => selectedIds.has(r.id));
  const selectedCount = selectedList.length;
  const clearSelection = (): void => {
    setSelectedIds(new Set());
    setBulkFolderMenuOpen(false);
  };

  // ── Pin / unpin ──────────────────────────────────────────────────────────
  const handleTogglePin = (targetFolderId: string): void => {
    if (!pinItem) return;
    const target = folders.find((f) => f.id === targetFolderId);
    if (!target) return;
    if (target.manualIds.indexOf(pinItem.id) !== -1) {
      unpinItem(targetFolderId, pinItem.id).catch(() => undefined);
    } else {
      pinItems(targetFolderId, [pinItem.id]).catch(() => undefined);
    }
  };
  const handleRemoveFromFolder = (id: string): void => {
    if (!activeFolder) return;
    unpinItem(activeFolder.id, id).catch(() => undefined);
  };

  // ── Bulk actions ─────────────────────────────────────────────────────────
  const canBulkFolder = (tab === 'inbox' || !!activeFolder) && folders.length > 0;
  const runBulk = (patch: Partial<ICorrespondenceStub>): void => {
    selectedList.forEach((r) => updateItemById(r.id, patch));
    clearSelection();
  };
  const bulkMarkRead = (): void => {
    readReceiptService.markRead(selectedList.map((r) => r.id)).catch(() => undefined);
    runBulk({ seen: true });
  };
  const bulkMarkUnread = (): void => {
    readReceiptService.markUnread(selectedList.map((r) => r.id)).catch(() => undefined);
    runBulk({ seen: false });
  };
  const bulkExpedite = (): void => setExpediteTargetIds(selectedList.map((r) => r.id));
  const bulkExportColumns: ICsvColumn<IInboxRow>[] = [
    { header: t('inboxSent.col.refNo'), accessor: (r) => r.referenceNumber || '' },
    { header: t('inboxSent.col.subject'), accessor: (r) => r.subject },
    { header: t('inboxSent.col.fromTo'), accessor: (r) => r.senderName || r.recipientName || '' },
    { header: t('inboxSent.col.security'), accessor: (r) => SECURITY_TIERS.find((x) => x.tier === r.securityTier)?.name || '' },
    { header: t('inboxSent.col.status'), accessor: (r) => STATUS_CONFIG[r.status]?.label ?? r.status },
    { header: t('inboxSent.col.date'), accessor: (r) => r.createdAt },
  ];
  const bulkExport = (): void => {
    exportRowsToCsv(selectedList, bulkExportColumns, `inbox-sent-selection-${selectedList.length}.csv`);
    clearSelection();
  };
  const bulkAddToFolder = (targetFolderId: string): void => {
    pinItems(targetFolderId, selectedList.map((r) => r.id)).catch(() => undefined);
    clearSelection();
  };
  const confirmBulkDeleteDrafts = (): void => {
    if (!pendingDeleteDraftIds) return;
    const ids = pendingDeleteDraftIds;
    setPendingDeleteDraftIds(undefined);
    clearSelection();
    bulkActionsService
      .deleteDrafts(ids)
      .then((result) => deleteItemsByIds(result.succeeded))
      .catch(() => undefined);
  };

  // ── Signature ────────────────────────────────────────────────────────────
  // Shared with the correspondence detail view's Signature action (src/utils/signature.ts)
  // so both paths produce the identical result — see CMS-047's AC.
  const handleSign = (id: string): void => {
    const row = items.find((i) => i.id === id);
    if (row) updateItemById(id, applySignature(row));
  };
  const canSign = canSignCorrespondence();

  // ── Flag Pending Response (CMS-014) ──────────────────────────────────────
  const handleFlagPendingResponse = (awaitedParty: IAwaitedParty): void => {
    if (!flagTarget) return;
    updateItemById(flagTarget.id, applyFlagPendingResponse(flagTarget, awaitedParty, currentUser?.displayName ?? 'Unknown'));
    setFlagTarget(undefined);
  };
  const handleClearPendingResponse = (id: string): void => updateItemById(id, applyClearPendingResponse());

  // ── Expedite (CMS-015) — single "…" item and bulk selection share this one handler ───────
  // CMS-015 AC5 — expedite is persisted server-side (role-gated + attributed + audited), then the
  // grid is optimistically patched for the rows the service actually actioned. auditExpedite writes
  // the Elasticsearch audit event (the service also writes the item Timeline event).
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
    if (!expediteTargetIds) return;
    const ids = expediteTargetIds;
    setExpediteTargetIds(undefined);
    clearSelection();
    bulkActionsService
      .expedite(ids, reason)
      .then((result) => {
        result.succeeded.forEach((id) => updateItemById(id, applyExpedite(reason, currentUser?.displayName ?? 'Unknown')));
        if (result.succeeded.length > 0) auditExpedite('Expedited', `Expedited ${result.succeeded.length} item(s) — ${reason}`);
      })
      .catch(() => undefined);
  };
  const handleRemoveExpedite = (id: string): void => {
    // CMS-015 AC6 — removal is persisted + audited server-side, not a local-only patch.
    bulkActionsService
      .removeExpedite([id])
      .then((result) => {
        if (result.succeeded.indexOf(id) === -1) return;
        updateItemById(id, applyRemoveExpedite());
        auditExpedite('Expedite Removed', `Expedite removed from ${id}`);
      })
      .catch(() => undefined);
  };
  const flagHandlers: IFlagActionHandlers<IInboxRow> = {
    onFlagPendingResponse: setFlagTarget,
    onClearPendingResponse: handleClearPendingResponse,
    onExpedite: (row) => setExpediteTargetIds([row.id]),
    onRemoveExpedite: handleRemoveExpedite,
  };

  const headerTitle = activeFolder ? activeFolder.name : t(FOLDER_LABEL_KEY[tab]);

  // ── Row actions menu ─────────────────────────────────────────────────────
  const detailOriginState = { originPath: location.pathname, originLabel: headerTitle };

  // A draft opens back in the Create Correspondence screen in edit mode (all fields shown, editable),
  // where the user can keep editing (Save Draft) or submit it (Send) — a submitted item, by
  // contrast, opens the read-only detail view.
  const openRow = (row: IInboxRow, detailTab: 'details' | 'preview'): void => {
    if (row.status === 'Draft') {
      navigate('/correspondence/new', { state: { editDraftId: row.id, ...detailOriginState } });
    } else {
      navigate(`/correspondence/${row.id}`, { state: { tab: detailTab, ...detailOriginState } });
    }
  };

  const buildRowActions = (row: IInboxRow): IActionsMenuItem[] => {
    // Inbox/Sent-specific folder actions appended to every menu (draft or not).
    const folderItems: IActionsMenuItem[] = [];
    if (row.direction === 'Incoming' && folders.length > 0) {
      folderItems.push({ key: 'pin', labelKey: 'inboxSent.action.pinToFolder', iconName: 'folderOpen', onClick: () => setPinItem(row) });
    }
    if (activeFolder && activeFolder.manualIds.indexOf(row.id) !== -1) {
      folderItems.push({ key: 'removeFromFolder', labelKey: 'inboxSent.action.removeFromFolder', iconName: 'x', onClick: () => handleRemoveFromFolder(row.id) });
    }
    if (folderItems.length > 0) folderItems[0] = { ...folderItems[0], dividerBefore: true };

    // A draft isn't a registered correspondence — it opens back in the Create screen for editing, so
    // the full correspondence action set (reply/preview/annotate/workflow) doesn't apply. Show just
    // Edit Draft plus the folder + flag actions.
    if (row.status === 'Draft') {
      const editDraft: IActionsMenuItem = {
        key: 'view',
        labelKey: 'inboxSent.action.editDraft',
        iconName: 'pencil',
        onClick: () => openRow(row, 'details'),
      };
      const deleteDraft: IActionsMenuItem = {
        key: 'deleteDraft',
        labelKey: 'inboxSent.bulk.delete',
        iconName: 'trash',
        dividerBefore: true,
        onClick: () => setPendingDeleteDraftIds([row.id]),
      };
      return [editDraft, deleteDraft, ...folderItems, ...buildFlagActionItems(row, currentUser, flagHandlers)];
    }

    // Registered items get the shared, Figma-ordered correspondence action menu.
    const coreItems = buildCorrespondenceRowActions(row, {
      navigate,
      originState: detailOriginState,
      currentUser,
    });
    return [...coreItems, ...folderItems, ...buildFlagActionItems(row, currentUser, flagHandlers)];
  };

  // ── Signature cell ───────────────────────────────────────────────────────
  const renderSignatureCell = (row: IInboxRow): React.ReactNode => {
    if (!row.signatureRequired) return <span className={styles.signatureDash}>—</span>;
    const signed = !!row.isSigned;
    const label = signed ? t('inboxSent.signature.signed') : t('inboxSent.signature.required');
    return (
      <label className={styles.signatureCell} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={signed}
          disabled={!canSign || signed}
          onChange={() => canSign && !signed && handleSign(row.id)}
        />
        <span className={signed ? styles.signatureLabelSigned : styles.signatureLabelRequired}>{label}</span>
      </label>
    );
  };

  // ── Subject cell (unread bold + dot) ─────────────────────────────────────
  const renderSubjectCell = (row: IInboxRow): React.ReactNode => (
    <span className={`${styles.tableSubject} ${row.seen === false ? styles.subjectUnread : styles.subjectRead}`}>
      {row.seen === false && <span className={styles.unreadDot} aria-hidden="true" />}
      {row.subject}
      <CorrespondenceFlagBadges item={row} badgeClassName={styles.inlineBadge} escalationDays={escalationDays} expeditedEscalationDays={slaConfig.expeditedDays} />
    </span>
  );

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns: DataGridColumn<IInboxRow>[] = [
    {
      field: 'referenceNumber',
      headerKey: 'inboxSent.col.refNo',
      filter: 'text',
      width: 140,
      cellRenderer: (row) => <span className={styles.tableRefNo}>{row.referenceNumber || '—'}</span>,
    },
    {
      field: 'subject',
      headerKey: 'inboxSent.col.subject',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: renderSubjectCell,
    },
    {
      field: 'senderName',
      headerKey: 'inboxSent.col.fromTo',
      filter: 'text',
      width: 150,
      cellRenderer: (row) => (
        <span style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>{row.senderName || row.recipientName || '—'}</span>
      ),
    },
    {
      field: 'securityTier',
      headerKey: 'inboxSent.col.security',
      filter: 'number',
      width: 150,
      cellRenderer: (row) => <TierBadge tier={row.securityTier} />,
    },
    {
      field: 'status',
      headerKey: 'inboxSent.col.status',
      filter: 'text',
      width: 110,
      cellRenderer: (row) => <StatusBadge label={STATUS_CONFIG[row.status]?.label ?? row.status} tone={correspondenceStatusTone(row.status)} />,
    },
    {
      field: 'createdAt',
      headerKey: 'inboxSent.col.date',
      filter: 'date',
      width: 130,
      cellRenderer: (row) => <span style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>{formatCardDateTime(row.createdAt)}</span>,
    },
    {
      field: 'hasAttachment',
      headerKey: 'inboxSent.col.attachment',
      filter: false,
      sortable: false,
      width: 100,
      cellRenderer: (row) =>
        row.hasAttachment ? <Icon name="paperclip" size={14} /> : <span style={{ color: 'var(--corms-text-secondary)' }}>—</span>,
    },
    {
      field: 'signatureFilterValue',
      headerKey: 'inboxSent.col.signature',
      filter: 'text',
      width: 120,
      cellRenderer: renderSignatureCell,
    },
    {
      field: 'id',
      headerKey: 'inboxSent.col.actions',
      filter: false,
      sortable: false,
      width: 60,
      cellRenderer: (row) => <ActionsMenu items={buildRowActions(row)} ariaLabelKey="inboxSent.actions" />,
    },
  ];

  const cardFields = (row: IInboxRow): ICorrespondenceCardField[] => [
    { label: t('inboxSent.field.fromTo'), node: row.senderName || row.recipientName || '—' },
    { label: t('inboxSent.field.date'), node: formatCardDateTime(row.createdAt) },
    {
      label: t('inboxSent.field.attachment'),
      node: row.hasAttachment ? <Icon name="paperclip" size={12} /> : '—',
    },
  ];

  const cardRenderer = (row: IInboxRow, selectionControl?: React.ReactNode): React.ReactNode => (
    <CorrespondenceCard
      refNo={row.referenceNumber || '—'}
      subject={row.subject}
      headerBadges={
        <>
          <TierBadge tier={row.securityTier} />
          <StatusBadge label={STATUS_CONFIG[row.status]?.label ?? row.status} tone={correspondenceStatusTone(row.status)} />
          <CorrespondenceFlagBadges item={row} escalationDays={escalationDays} expeditedEscalationDays={slaConfig.expeditedDays} />
        </>
      }
      fields={cardFields(row)}
      actions={<ActionsMenu items={buildRowActions(row)} ariaLabelKey="inboxSent.actions" />}
      selectionControl={selectionControl}
      footer={row.signatureRequired ? <div className={styles.signatureFooterRow}>{renderSignatureCell(row)}</div> : undefined}
    />
  );

  return (
    <div className={styles.dashboard}>
      <ModuleHeader icon="mail" title={headerTitle} />

      <div className={styles.logCard}>
        {/* Folder tabs row */}
        <div className={styles.folderTabsRow}>
          {(['inbox', 'sent', 'drafts'] as Tab[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.folderTab} ${!activeFolder && tab === f ? styles.folderTabActive : ''}`}
              onClick={() => navigate(`/inbox-sent/${f}`)}
            >
              {t(FOLDER_LABEL_KEY[f])}
            </button>
          ))}
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`${styles.folderTab} ${styles.folderTabWithDelete} ${activeFolder?.id === folder.id ? styles.folderTabActive : ''}`}
            >
              <button type="button" className={styles.folderTabButton} onClick={() => navigate(`/inbox-sent/folder/${folder.id}`)}>
                <Icon name="folderOpen" size={13} />
                {folder.name}
              </button>
              <button
                type="button"
                className={styles.folderTabDeleteBtn}
                onClick={() => setPendingDeleteFolder(folder)}
                aria-label={t('inboxSent.folder.deleteFolder')}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className={styles.createFolderTab} onClick={() => setCreateFolderOpen(true)}>
            <Icon name="plus" size={14} />
            {t('inboxSent.folder.createFolder')}
          </button>
          {activeFolder && (
            <div className={styles.folderContextBar}>
              <span>
                <Icon name="folderOpen" size={13} /> <span className={styles.folderContextName}>{activeFolder.name}</span> ·{' '}
                {folderCriteriaSummary(activeFolder.criteria, t, recordClassifications)}
              </span>
              <button type="button" className={styles.deleteFolderBtn} onClick={() => setPendingDeleteFolder(activeFolder)}>
                <Icon name="trash" size={14} />
                {t('inboxSent.folder.deleteFolder')}
              </button>
            </div>
          )}
        </div>

        {/* Quick filter tabs */}
        <div className={styles.quickFilterRow}>
          {(
            [
              ['all', 'inboxSent.quickFilter.all'],
              ['unread', 'inboxSent.quickFilter.unread'],
              ['high', 'inboxSent.quickFilter.highPriority'],
            ] as [QuickFilter, string][]
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={`${styles.quickFilterTab} ${quickFilter === id ? styles.quickFilterTabActive : ''}`}
              onClick={() => setQuickFilter(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {/* Filter row (CMS-039 AC5) — date range, status, security level and team, with one
            Clear Filters action covering these and the toolbar search box. */}
        <div className={styles.filterRow}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t('inboxSent.filters.dateFrom')}</span>
            <input
              type="date"
              className={styles.filterInput}
              value={listFilters.dateFrom}
              max={listFilters.dateTo || undefined}
              onChange={(e) => setListFilter({ dateFrom: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t('inboxSent.filters.dateTo')}</span>
            <input
              type="date"
              className={styles.filterInput}
              value={listFilters.dateTo}
              min={listFilters.dateFrom || undefined}
              onChange={(e) => setListFilter({ dateTo: e.target.value })}
            />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t('inboxSent.filters.status')}</span>
            <select
              className={styles.filterSelect}
              value={listFilters.status}
              onChange={(e) => setListFilter({ status: e.target.value })}
            >
              <option value="">{t('inboxSent.filters.any')}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {STATUS_CONFIG[status]?.label ?? status}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t('inboxSent.filters.security')}</span>
            <select
              className={styles.filterSelect}
              value={listFilters.securityTier}
              onChange={(e) => setListFilter({ securityTier: e.target.value })}
            >
              <option value="">{t('inboxSent.filters.any')}</option>
              {SECURITY_TIERS.filter((tier) => tier.tier <= maxClearanceTier).map((tier) => (
                <option key={tier.tier} value={String(tier.tier)}>
                  {tier.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t('inboxSent.filters.team')}</span>
            <select
              className={styles.filterSelect}
              value={listFilters.department}
              onChange={(e) => setListFilter({ department: e.target.value })}
            >
              <option value="">{t('inboxSent.filters.any')}</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={() => setListFilters(EMPTY_LIST_FILTERS)}
            disabled={!filtersActive}
          >
            <Icon name="x" size={13} />
            {t('inboxSent.filters.clear')}
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedCount > 0 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkCount}>
              <Icon name="checkCircle" size={14} /> {t('inboxSent.bulk.selected', { count: selectedCount })}
            </span>
            <button type="button" className={styles.bulkClear} onClick={clearSelection}>
              {t('inboxSent.bulk.clear')}
            </button>
            <div className={styles.bulkDivider} />
            {canBulkFolder && (
              <div className={styles.bulkFolderWrap} ref={bulkFolderWrapRef}>
                <button type="button" className={styles.bulkBtn} onClick={() => setBulkFolderMenuOpen((o) => !o)}>
                  <Icon name="folderOpen" size={14} /> {t('inboxSent.bulk.addToFolder')} ▾
                </button>
                {bulkFolderMenuOpen && (
                  <div className={styles.bulkFolderMenu}>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        className={styles.bulkFolderMenuItem}
                        onClick={() => bulkAddToFolder(folder.id)}
                      >
                        <Icon name="folderOpen" size={14} /> {folder.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className={styles.bulkBtn} onClick={bulkMarkRead}>
              <Icon name="mail" size={14} /> {t('inboxSent.bulk.markRead')}
            </button>
            <button type="button" className={styles.bulkBtn} onClick={bulkMarkUnread}>
              <Icon name="mail" size={14} /> {t('inboxSent.bulk.markUnread')}
            </button>
            {tab === 'inbox' && !activeFolder && (
              <button type="button" className={styles.bulkBtn} onClick={bulkExpedite}>
                <Icon name="alertTriangle" size={14} /> {t('inboxSent.bulk.expedite')}
              </button>
            )}
            <button type="button" className={styles.bulkBtn} onClick={bulkExport}>
              <Icon name="download" size={14} /> {t('inboxSent.bulk.export')}
            </button>
            {tab === 'drafts' && !activeFolder && (
              <button
                type="button"
                className={styles.bulkBtnDanger}
                onClick={() => setPendingDeleteDraftIds(selectedList.map((r) => r.id))}
              >
                <Icon name="trash" size={14} /> {t('inboxSent.bulk.delete')}
              </button>
            )}
          </div>
        )}

        <DataGrid<IInboxRow>
          columns={columns}
          rows={gridRows}
          loading={loading}
          onRefresh={fetchData}
          getRowId={(row) => row.id}
          onRowClick={(row) => openRow(row, 'preview')}
          defaultViewMode="cards"
          enableViewToggle={true}
          cardRenderer={cardRenderer}
          gridId="inbox-sent"
          emptyStateKey="inboxSent.noItems"
          selectable={true}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          toolbarLeftActions={
            <>
              {/* AC12 — "New Correspondence" sits on the listing toolbar ahead of the search box. */}
              <button type="button" className={gridStyles.gridToolbarBtnPrimary} onClick={() => navigate('/correspondence/new')}>
                <Icon name="plus" size={14} />
                <span>{t('inboxSent.toolbar.newCorrespondence')}</span>
              </button>
              <SearchBox
                value={listFilters.freeText}
                placeholder={t('inboxSent.toolbar.searchPlaceholder')}
                onChange={(value) => setListFilter({ freeText: value })}
              />
            </>
          }
        />
      </div>

      <CreateFolderModal
        isOpen={createFolderOpen}
        onDismiss={() => setCreateFolderOpen(false)}
        maxClearanceTier={maxClearanceTier}
        recordClassifications={recordClassifications}
        onSave={(input) => {
          createFolder(input)
            .then((created) => navigate(`/inbox-sent/folder/${created.id}`))
            .catch(() => undefined);
          setCreateFolderOpen(false);
        }}
      />

      <PinToFolderModal
        isOpen={!!pinItem}
        onDismiss={() => setPinItem(undefined)}
        folders={folders}
        pinnedFolderIds={pinItem ? folders.filter((f) => f.manualIds.indexOf(pinItem.id) !== -1).map((f) => f.id) : []}
        onTogglePin={handleTogglePin}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteDraftIds}
        title={t('inboxSent.bulk.deleteConfirmTitle')}
        message={t('inboxSent.bulk.deleteConfirmMessage', { count: pendingDeleteDraftIds?.length ?? 0 })}
        confirmLabel={t('inboxSent.bulk.deleteConfirm')}
        cancelLabel={t('inboxSent.bulk.cancel')}
        destructive
        onConfirm={confirmBulkDeleteDrafts}
        onCancel={() => setPendingDeleteDraftIds(undefined)}
      />

      <FlagPendingResponseModal
        isOpen={!!flagTarget}
        onDismiss={() => setFlagTarget(undefined)}
        onFlag={handleFlagPendingResponse}
      />

      <ExpediteReasonModal
        isOpen={!!expediteTargetIds}
        targetCount={expediteTargetIds?.length ?? 0}
        onDismiss={() => setExpediteTargetIds(undefined)}
        onConfirm={handleConfirmExpedite}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteFolder}
        title={t('inboxSent.folder.deleteFolderConfirmTitle')}
        message={t('inboxSent.folder.deleteFolderConfirmMessage', { name: pendingDeleteFolder?.name ?? '' })}
        confirmLabel={t('inboxSent.folder.deleteFolderConfirm')}
        cancelLabel={t('inboxSent.folder.cancel')}
        destructive
        onConfirm={() => {
          if (!pendingDeleteFolder) return;
          const deletingActive = activeFolder?.id === pendingDeleteFolder.id;
          deleteFolder(pendingDeleteFolder.id)
            .then(() => {
              if (deletingActive) navigate('/inbox-sent/inbox');
            })
            .catch(() => undefined);
          setPendingDeleteFolder(undefined);
        }}
        onCancel={() => setPendingDeleteFolder(undefined)}
      />
    </div>
  );
};

export default InboxSentView;

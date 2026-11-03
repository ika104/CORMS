import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { StatusBadge } from '../../components/common/StatusBadge';
import { CorrespondenceCard } from '../../components/common/CorrespondenceCard';
import { ActionsMenu, IActionsMenuItem } from '../../components/common/ActionsMenu';
import { SECURITY_TIERS } from '../../models/ICorrespondence';
import { ITeamInboxItem, ITeamInboxQueryItem, TEAM_INBOX_STATUS_CONFIG } from '../../models/ITeamInbox';
import { IDirectoryPerson } from '../../models/IDelegation';
import { useServices } from '../../services/ServiceProvider';
import { useServerGrid } from '../../components/grid/useServerGrid';
import { formatCardDateTime } from '../../utils/formatDateTime';
import { ReassignModal, IReassignConfirmInput } from './components/ReassignModal';
import styles from './TeamInboxView.module.scss';

interface ITeamInboxRow extends ITeamInboxItem {
  ownerName: string;
}

// Client feedback: too much colour on the cards — Security is drawn as a plain neutral label.
// eslint-disable-next-line @rushstack/no-new-null
function SecurityBadge({ tier }: { tier: number }): React.ReactElement | null {
  const cfg = SECURITY_TIERS.find((t) => t.tier === tier);
  if (!cfg) return null;
  return (
    <span className={styles.securityBadge} style={{ color: '#605e5c', background: 'transparent', border: 'none', padding: 0 }}>
      {cfg.short}
    </span>
  );
}

const ALL_FILTER = 'all';

// CMS-018 query-side result (ITeamInboxQueryItem, from ICorrespondenceStub) -> the existing
// screen's display model (ITeamInboxItem) so the column defs/ReassignModal below stay unchanged.
// Clearance trimming is done server-side by SubordinateInboxServiceCore (both live and mock), so
// unlike the earlier local-state version, no client-side clearance re-filter runs here.
function toTeamInboxItem(q: ITeamInboxQueryItem): ITeamInboxItem {
  return {
    id: q.id,
    referenceNo: q.referenceNumber,
    subject: q.subject,
    type: q.type,
    priority: q.priority,
    securityTier: q.securityTier,
    status: q.displayStatus,
    date: q.createdAt,
    ownerId: q.ownerId,
  };
}

function personName(subordinates: IDirectoryPerson[], id: string): string {
  return subordinates.find((p) => p.id === id)?.displayName ?? id;
}

const TeamInboxView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const services = useServices();
  // The supervisor's direct reports — replaces the old hard-coded getSubordinates() mock helper.
  // Both this and getTeamInbox() below resolve "who is asking" server-side (see
  // IOrgHierarchyService / ISubordinateInboxService), so this screen never has to wait on, or
  // guard against, useNav()'s asynchronously-resolving identity at all.
  const [subordinates, setSubordinates] = React.useState<IDirectoryPerson[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    services.orgHierarchyService
      .getMyDirectReports()
      .then((people) => {
        if (!cancelled) setSubordinates(people);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [services.orgHierarchyService]);

  const {
    rows: queryItems,
    loading,
    refresh,
  } = useServerGrid<ITeamInboxQueryItem>({
    cacheNamespace: 'team-inbox',
    cacheKey: 'my-team',
    queryFn: () => services.subordinateInboxService.getTeamInbox(),
    deps: [services.subordinateInboxService],
  });

  const items = React.useMemo(() => queryItems.map(toTeamInboxItem), [queryItems]);

  const [selectedOwner, setSelectedOwner] = React.useState<string>(ALL_FILTER);
  const [reassignItem, setReassignItem] = React.useState<ITeamInboxItem | undefined>(undefined);
  const [recentReassignments, setRecentReassignments] = React.useState<
    { itemId: string; refNo: string; fromOwnerId: string; toOwnerName: string }[]
  >([]);
  const [successMessage, setSuccessMessage] = React.useState<string | undefined>(undefined);

  // One memo, not two passes: re-spreading the memoized `items` into fresh objects on every render
  // would defeat that memo entirely, and DataGrid compares rows by per-element reference identity —
  // a new array each render resets it to page 1 on every unrelated state change.
  const rows: ITeamInboxRow[] = React.useMemo(() => {
    const filtered = selectedOwner === ALL_FILTER ? items : items.filter((i) => i.ownerId === selectedOwner);
    return filtered.map((i) => ({ ...i, ownerName: personName(subordinates, i.ownerId) }));
  }, [items, selectedOwner, subordinates]);

  const rowActions = (row: ITeamInboxRow): IActionsMenuItem[] => [
    {
      key: 'reassign',
      labelKey: 'teamInbox.action.reassign',
      iconName: 'repeat',
      onClick: () => setReassignItem(items.find((i) => i.id === row.id)),
    },
  ];

  const handleReassignConfirm = (input: IReassignConfirmInput): Promise<void> => {
    if (!reassignItem) return Promise.resolve();
    const fromOwnerId = reassignItem.ownerId;
    const refNo = reassignItem.referenceNo;

    return services.reassignmentService
      .reassign({
        correspondenceId: input.itemId,
        fromUserId: fromOwnerId,
        toUserId: input.toOwnerId,
        reason: input.reason,
      })
      .then(() => {
        setRecentReassignments((prev) => [{ itemId: input.itemId, refNo, fromOwnerId, toOwnerName: input.toOwnerName }, ...prev]);
        setSuccessMessage(t('reassign.success', { name: input.toOwnerName }));
        setReassignItem(undefined);
        window.setTimeout(() => setSuccessMessage(undefined), 3500);
        refresh();
      });
    // Not caught here — ReassignModal awaits this promise itself and surfaces a rejection (e.g.
    // CMS-019 AC1/AC2's server-side clearance re-check) as its own inline error.
  };

  const ownerNotes =
    selectedOwner === ALL_FILTER
      ? recentReassignments
      : recentReassignments.filter((r) => r.fromOwnerId === selectedOwner);

  const columns: DataGridColumn<ITeamInboxRow>[] = [
    {
      field: 'ownerName',
      headerKey: 'teamInbox.col.owner',
      filter: 'text',
      minWidth: 140,
      cellRenderer: (row) => <span className={styles.bold}>{row.ownerName}</span>,
    },
    {
      field: 'referenceNo',
      headerKey: 'teamInbox.col.refNo',
      filter: 'text',
      width: 140,
      cellRenderer: (row) => <span className={styles.mono}>{row.referenceNo}</span>,
    },
    { field: 'subject', headerKey: 'teamInbox.col.subject', filter: 'text', flex: 1, minWidth: 200 },
    { field: 'type', headerKey: 'teamInbox.col.type', filter: 'text', width: 130 },
    {
      field: 'priority',
      headerKey: 'teamInbox.col.priority',
      filter: 'text',
      width: 100,
      cellRenderer: (row) => (
        <span className={row.priority === 'High' ? styles.priorityHigh : undefined}>
          {t(`teamInbox.priority.${row.priority.toLowerCase()}`)}
        </span>
      ),
    },
    {
      field: 'securityTier',
      headerKey: 'teamInbox.col.security',
      filter: 'number',
      width: 130,
      cellRenderer: (row) => <SecurityBadge tier={row.securityTier} />,
    },
    {
      field: 'status',
      headerKey: 'teamInbox.col.status',
      filter: 'text',
      width: 140,
      cellRenderer: (row) => {
        const cfg = TEAM_INBOX_STATUS_CONFIG[row.status];
        return <StatusBadge label={t(cfg.labelKey)} tone={cfg.tone} />;
      },
    },
    {
      field: 'date',
      headerKey: 'teamInbox.col.date',
      filter: 'date',
      width: 130,
      cellRenderer: (row) => <span>{formatCardDateTime(row.date)}</span>,
    },
    {
      field: 'id',
      headerKey: 'teamInbox.col.actions',
      filter: false,
      sortable: false,
      width: 70,
      cellRenderer: (row) => <ActionsMenu items={rowActions(row)} ariaLabelKey="teamInbox.actions" />,
    },
  ];

  const cardRenderer = (row: ITeamInboxRow): React.ReactNode => {
    const cfg = TEAM_INBOX_STATUS_CONFIG[row.status];
    const note = recentReassignments.find((r) => r.itemId === row.id);
    return (
      <CorrespondenceCard
        refNo={row.referenceNo}
        subject={row.subject}
        actions={<ActionsMenu items={rowActions(row)} ariaLabelKey="teamInbox.actions" />}
        fields={[
          { label: t('teamInbox.col.owner'), node: row.ownerName },
          { label: t('teamInbox.col.type'), node: row.type },
          {
            label: t('teamInbox.col.priority'),
            node: (
              <span className={row.priority === 'High' ? styles.priorityHigh : undefined}>
                {t(`teamInbox.priority.${row.priority.toLowerCase()}`)}
              </span>
            ),
          },
          { label: t('teamInbox.col.security'), node: <SecurityBadge tier={row.securityTier} /> },
          { label: t('teamInbox.col.status'), node: <StatusBadge label={t(cfg.labelKey)} tone={cfg.tone} /> },
          { label: t('teamInbox.col.date'), node: formatCardDateTime(row.date) },
        ]}
        footer={
          note ? (
            <span className={styles.reassignedNote}>{t('teamInbox.reassignedIndicator', { name: note.toOwnerName })}</span>
          ) : undefined
        }
      />
    );
  };

  const reassignCandidates = reassignItem ? subordinates.filter((s) => s.id !== reassignItem.ownerId) : [];

  return (
    <div className={styles.page}>
      <ModuleHeader icon="users" title={t('module.teamInbox.title')} />

      <div className={styles.body}>
        <div className={styles.viewingRow}>
          <label className={styles.viewingLabel}>
            {t('teamInbox.viewing')}
            <select className={styles.viewingSelect} value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)}>
              <option value={ALL_FILTER}>{t('teamInbox.allSubordinates')}</option>
              {subordinates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {ownerNotes.length > 0 && (
          <div className={styles.notesStrip}>
            {ownerNotes.map((n) => (
              <span key={n.itemId} className={styles.reassignedNote}>
                {n.refNo} — {t('teamInbox.reassignedIndicator', { name: n.toOwnerName })}
              </span>
            ))}
          </div>
        )}

        {successMessage && <div className={styles.toast}>{successMessage}</div>}

        <div className={styles.panel}>
          <DataGrid<ITeamInboxRow>
            columns={columns}
            rows={rows}
            loading={loading}
            onRefresh={refresh}
            getRowId={(row) => row.id}
            defaultViewMode="cards"
            enableViewToggle={true}
            cardRenderer={cardRenderer}
            gridId="team-inbox"
            emptyStateKey="teamInbox.noItems"
            toolbarTitle={t('module.teamInbox.title')}
            onRowClick={(row) =>
              navigate(`/correspondence/${row.id}`, {
                state: { tab: 'preview', originPath: '/team-inbox', originLabel: t('module.teamInbox.title') },
              })
            }
          />
        </div>
      </div>

      <ReassignModal
        isOpen={!!reassignItem}
        item={reassignItem}
        currentOwnerName={reassignItem ? personName(subordinates, reassignItem.ownerId) : ''}
        candidates={reassignCandidates}
        onDismiss={() => setReassignItem(undefined)}
        onConfirm={handleReassignConfirm}
      />
    </div>
  );
};

export default TeamInboxView;

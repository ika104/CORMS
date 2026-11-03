import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { IButtonStyles } from '@fluentui/react';
import { Plus } from 'lucide-react';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useNav } from '../../state/hooks';
import { useServices } from '../../services/ServiceProvider';
import { useServerGrid } from '../../components/grid/useServerGrid';
import { DELEGATION_STATUS_CONFIG, IDelegation, IDirectoryPerson } from '../../models/IDelegation';
import { IDelegationAuditSummaryRow, IDelegationRecord } from '../../services/interfaces/IDelegationService';
import { CreateDelegationModal, ICreateDelegationSaveInput } from './components/CreateDelegationModal';
import gridStyles from '../../components/grid/DataGrid.module.scss';
import styles from './DelegationView.module.scss';

const compactBtnStyles: IButtonStyles = {
  root: { height: 26, minWidth: 0, padding: '0 10px' },
  label: { fontSize: 12, fontWeight: 600 },
};

// Per CMS-017: delegation applies immediately with no approval step, for both self-service and
// admin-created delegations — DelegationServiceCore.create() always lands a new delegation as
// Active server-side, so this view never has to synthesize that status itself the way the old
// local-state mock did.

interface IDelegationRow extends IDelegation {
  periodLabel: string;
}

function toDelegationRow(r: IDelegationRecord): IDelegationRow {
  return {
    id: r.id,
    fromUserId: r.delegatorId,
    fromUserName: r.delegatorName,
    toUserId: r.delegateId,
    toUserName: r.delegateName,
    reason: r.reason,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    periodLabel: `${r.startDate} → ${r.endDate}`,
  };
}

const DelegationView: React.FC = () => {
  const { t } = useTranslation();
  const services = useServices();
  const { currentUser, currentRole, isLoading: identityLoading } = useNav();
  // CORMS_UserRoles' own vocabulary (CormsRole), resolved by RoleService — not IUser.roles, which
  // RecordsHubServiceLive never populates (`roles: []`) and whose 'Administrator' literal is a
  // mock-only string. Same check AdministrationView uses for its own admin gate.
  const isAdmin = currentRole === 'SystemAdministrator';

  const [modalOpen, setModalOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | undefined>(undefined);

  // Panel A: admins see every delegation (per the story's admin-vs-self-service framing),
  // everyone else sees only the delegations they created themselves. `listMine()` takes no user id
  // — the service resolves the acting identity itself (see IDelegationService).
  //
  // Disabled until useNav()'s role resolves, rather than firing immediately: currentRole is
  // undefined for a moment, so an ungated grid would run listMine() first and then listAll() once
  // the role lands — two queries whose results could arrive in either order.
  const {
    rows: delegationRecords,
    loading: delegationsLoading,
    refresh: refreshDelegations,
  } = useServerGrid<IDelegationRecord>({
    cacheNamespace: 'delegation-list',
    cacheKey: isAdmin ? 'all' : 'mine',
    queryFn: () => (isAdmin ? services.delegationService.listAll() : services.delegationService.listMine()),
    deps: [services.delegationService, isAdmin],
    enabled: !identityLoading,
  });

  // Panel B: audit/history summary — independent of Panel A's admin/self-service split.
  const {
    rows: auditRows,
    loading: auditLoading,
    refresh: refreshAudit,
  } = useServerGrid<IDelegationAuditSummaryRow>({
    cacheNamespace: 'delegation-audit-summary',
    cacheKey: 'all',
    queryFn: () => services.delegationService.getAuditSummary(),
    deps: [services.delegationService],
  });

  // Delegate-picker directory, fetched once and handed down to the modal — it never imports the
  // fixture/service directly. Fetched alongside the signed-in user's own directory id (independent
  // reads, run together) so CreateDelegationModal can exclude "myself" from the Delegate To list by
  // id rather than comparing display names across site collections — see getMyDirectoryId's comment.
  const [directory, setDirectory] = React.useState<IDirectoryPerson[]>([]);
  const [myDirectoryId, setMyDirectoryId] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([services.delegationService.listDirectory(), services.delegationService.getMyDirectoryId()])
      .then(([people, id]) => {
        if (cancelled) return;
        setDirectory(people);
        setMyDirectoryId(id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [services.delegationService]);

  const handleRevoke = (id: string): void => {
    setActionError(undefined);
    // No reason-collection affordance exists on this row action today (a single-click Revoke
    // button) — a fixed placeholder reason keeps this a small data-plumbing change rather than a
    // new modal; DelegationServiceCore.revoke's own authorization rules are unaffected either way.
    services.delegationService
      .revoke(id, 'Revoked via Delegation Management')
      .then(() => {
        refreshDelegations();
        refreshAudit();
      })
      .catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : String(err));
      });
  };

  // ICreateDelegationSaveInput is deliberately shaped as ICreateDelegationInput (see that
  // interface's comment), so it forwards as-is rather than being re-listed field by field.
  const handleSave = (input: ICreateDelegationSaveInput): Promise<void> =>
    services.delegationService
      .create(input)
      .then(() => {
        setModalOpen(false);
        refreshDelegations();
        refreshAudit();
      });
  // Intentionally not caught here — CreateDelegationModal awaits this promise itself and
  // surfaces a rejection (e.g. AC5's server-side attachment fileType validation) as its own
  // inline error, keeping the modal open with the form's data intact.

  // Memoized: DataGrid compares rows by per-element reference identity and resets to page 1 on any
  // difference, so rebuilding this array on every unrelated re-render would silently reset paging.
  const delegationRows = React.useMemo(() => delegationRecords.map(toDelegationRow), [delegationRecords]);

  const delegationColumns: DataGridColumn<IDelegationRow>[] = [
    {
      field: 'fromUserName',
      headerKey: 'delegation.col.from',
      filter: 'text',
      minWidth: 150,
      cellRenderer: (row) => <span className={styles.bold}>{row.fromUserName}</span>,
    },
    {
      field: 'toUserName',
      headerKey: 'delegation.col.delegateTo',
      filter: 'text',
      minWidth: 150,
    },
    {
      field: 'reason',
      headerKey: 'delegation.col.reason',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => (
        <span className={styles.truncate} title={row.reason}>
          {row.reason}
        </span>
      ),
    },
    {
      field: 'periodLabel',
      headerKey: 'delegation.col.period',
      filter: 'text',
      minWidth: 190,
      cellRenderer: (row) => <span className={styles.period}>{row.periodLabel}</span>,
    },
    {
      field: 'status',
      headerKey: 'delegation.col.status',
      filter: 'text',
      width: 120,
      cellRenderer: (row) => {
        const cfg = DELEGATION_STATUS_CONFIG[row.status];
        return <StatusBadge label={t(cfg.labelKey)} tone={cfg.tone} />;
      },
    },
    {
      field: 'id',
      headerKey: 'delegation.col.actions',
      filter: false,
      sortable: false,
      width: 110,
      cellRenderer: (row) =>
        row.status === 'Active' ? (
          <Button
            variant="danger"
            text={t('delegation.action.revoke')}
            styles={compactBtnStyles}
            onClick={() => handleRevoke(row.id)}
          />
        ) : null,
    },
  ];

  const auditColumns: DataGridColumn<IDelegationAuditSummaryRow>[] = [
    {
      field: 'userName',
      headerKey: 'delegation.col.userName',
      filter: 'text',
      minWidth: 170,
      cellRenderer: (row) => (
        // TODO(confirm): no per-user delegation-history detail view exists yet — link is
        // visual only until that destination is defined.
        <a href="#" className={styles.link} onClick={(e) => e.preventDefault()}>
          {row.userName}
        </a>
      ),
    },
    { field: 'team', headerKey: 'delegation.col.team', filter: 'text', minWidth: 150 },
    {
      field: 'totalCreated',
      headerKey: 'delegation.col.totalCreated',
      filter: 'number',
      width: 140,
      cellRenderer: (row) => <span className={styles.bold}>{row.totalCreated}</span>,
    },
    {
      field: 'accepted',
      headerKey: 'delegation.col.accepted',
      filter: 'number',
      width: 120,
      cellRenderer: (row) => <span className={styles.success}>{row.accepted}</span>,
    },
    {
      field: 'rejected',
      headerKey: 'delegation.col.rejected',
      filter: 'number',
      width: 120,
      cellRenderer: (row) => <span className={styles.danger}>{row.rejected}</span>,
    },
  ];

  return (
    <div className={styles.page}>
      {actionError && <div className={styles.errorBanner}>{actionError}</div>}

      <div className={styles.panel}>
        <DataGrid<IDelegationRow>
          columns={delegationColumns}
          rows={delegationRows}
          loading={delegationsLoading}
          onRefresh={refreshDelegations}
          getRowId={(row) => row.id}
          defaultViewMode="table"
          enableViewToggle={false}
          gridId="delegation-management"
          emptyStateKey="delegation.noItems"
          toolbarTitle={t('delegation.panelA.title')}
          toolbarLeftActions={
            <button type="button" className={gridStyles.gridToolbarBtnPrimary} onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              <span>{t('delegation.panelA.createButton')}</span>
            </button>
          }
        />
      </div>

      <div className={styles.panel}>
        <DataGrid<IDelegationAuditSummaryRow>
          columns={auditColumns}
          rows={auditRows}
          loading={auditLoading}
          onRefresh={refreshAudit}
          getRowId={(row) => row.userId}
          defaultViewMode="table"
          enableViewToggle={false}
          gridId="delegation-audit"
          emptyStateKey="delegation.noAuditItems"
          toolbarTitle={t('delegation.panelB.title')}
        />
      </div>

      {/* TODO: surface DelegationService.getDelegationLedger() (per-delegation attachment ledger
          + its own search/team filter) in a dedicated panel once that UI is scheduled — this task
          wires the two existing panels (delegation list, audit summary) only. */}

      <CreateDelegationModal
        isOpen={modalOpen}
        onDismiss={() => setModalOpen(false)}
        onSave={handleSave}
        isAdmin={isAdmin}
        currentUserName={currentUser?.displayName ?? ''}
        currentUserId={myDirectoryId}
        directory={directory}
      />
    </div>
  );
};

export default DelegationView;

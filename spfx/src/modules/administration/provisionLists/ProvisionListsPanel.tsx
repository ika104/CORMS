import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Button } from '../../../components/common/Button';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { StatusBadge, StatusBadgeTone } from '../../../components/common/StatusBadge';
import { useServices } from '../../../state/hooks';
import { SCHEMAS } from '../../../provisioning/listSchemas';
import {
  IListStatus,
  IProvisionEvent,
  IProvisionTally,
} from '../../../services/interfaces/IProvisioningService';
import { ISeedTasksResult } from '../../../services/interfaces/ISeedTasksService';
import styles from './ProvisionListsPanel.module.scss';

interface IProvisionRow extends IListStatus {
  colListName: string;
  colStatus: string;
  colFieldCount: string;
  colLastProvisioned: string;
  colActions: string;
}

type RowStatusKind = 'notCreated' | 'exists' | 'fieldsIncomplete';

function rowStatusKind(row: IListStatus): RowStatusKind {
  if (!row.exists) return 'notCreated';
  if (row.fieldCount < row.expectedFieldCount) return 'fieldsIncomplete';
  return 'exists';
}

const STATUS_TONES: Record<RowStatusKind, StatusBadgeTone> = {
  notCreated: 'neutral',
  exists: 'success',
  fieldsIncomplete: 'warning',
};

const ProvisionListsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { provisioningService, seedTasksService, configService } = useServices();

  const [statuses, setStatuses] = React.useState<IListStatus[] | undefined>(undefined);
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  const [runningSchema, setRunningSchema] = React.useState<string | undefined>(undefined);
  const [log, setLog] = React.useState<IProvisionEvent[]>([]);
  const [tally, setTally] = React.useState<IProvisionTally | undefined>(undefined);
  const [lastProvisionedAt, setLastProvisionedAt] = React.useState<Record<string, Date>>({});

  // "Seed Sample Tasks" (Part 5) — a clearly separate action from "Create / Update All Lists"
  // above: different button, different confirmation copy, its own running/result state. Never
  // shares runningSchema/log/tally with the schema-provisioning flow, so the two actions can't be
  // confused with each other in the UI.
  const [seedConfirmOpen, setSeedConfirmOpen] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);
  const [seedResult, setSeedResult] = React.useState<ISeedTasksResult | undefined>(undefined);
  const [seedError, setSeedError] = React.useState<string | undefined>(undefined);
  // Lightweight environment guard (Part 5's own instruction) — never blocks the action outright
  // (an admin may legitimately need to seed a non-DEV test tenant), just surfaces a stronger
  // warning in the confirmation copy when this isn't the DEV environment.
  const isDevEnv = configService.getConfig().environment === 'dev';

  const runSeedTasks = (): void => {
    setSeedConfirmOpen(false);
    setSeeding(true);
    setSeedError(undefined);
    seedTasksService
      .run()
      .then((result) => {
        setSeedResult(result);
        setSeeding(false);
      })
      .catch((err: unknown) => {
        setSeedError(err instanceof Error ? err.message : String(err));
        setSeeding(false);
      });
  };

  const fetchStatus = React.useCallback(() => {
    setLoadingStatus(true);
    provisioningService
      .getStatus(SCHEMAS)
      .then((data) => {
        setStatuses(data);
        setLoadingStatus(false);
      })
      .catch(() => {
        setStatuses([]);
        setLoadingStatus(false);
      });
  }, [provisioningService]);

  React.useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isRunning = runningSchema !== undefined;

  const runProvision = (schemas: typeof SCHEMAS, runLabel: string): void => {
    if (isRunning) return;
    setRunningSchema(runLabel);
    setLog([]);
    setTally(undefined);
    const seenTitles = new Set<string>();
    provisioningService
      .provisionAll(schemas, (event: IProvisionEvent) => {
        seenTitles.add(event.schemaTitle);
        setLog((prev) => [...prev, event]);
      })
      .then((finalTally) => {
        setTally(finalTally);
        const now = new Date();
        setLastProvisionedAt((prev) => {
          const next = { ...prev };
          seenTitles.forEach((title) => {
            next[title] = now;
          });
          return next;
        });
        setRunningSchema(undefined);
        fetchStatus();
      })
      .catch(() => {
        setRunningSchema(undefined);
        fetchStatus();
      });
  };

  const rows: IProvisionRow[] = (statuses ?? []).map((status) => ({
    ...status,
    colListName: status.schemaTitle,
    colStatus: status.schemaTitle,
    colFieldCount: status.schemaTitle,
    colLastProvisioned: status.schemaTitle,
    colActions: status.schemaTitle,
  }));

  const columns: DataGridColumn<IProvisionRow>[] = [
    {
      field: 'colListName',
      headerKey: 'provisionLists.column.listName',
      filter: 'text',
      flex: 1,
      minWidth: 200,
      cellRenderer: (row) => <span className={styles.listName}>{row.resolvedTitle}</span>,
    },
    {
      field: 'colStatus',
      headerKey: 'provisionLists.column.status',
      filter: false,
      width: 160,
      cellRenderer: (row) => {
        const kind = rowStatusKind(row);
        return <StatusBadge label={t(`provisionLists.status.${kind}`)} tone={STATUS_TONES[kind]} />;
      },
    },
    {
      field: 'colFieldCount',
      headerKey: 'provisionLists.column.fieldCount',
      filter: false,
      width: 120,
      cellRenderer: (row) => (
        <span>
          {row.fieldCount} / {row.expectedFieldCount}
        </span>
      ),
    },
    {
      field: 'colLastProvisioned',
      headerKey: 'provisionLists.column.lastProvisioned',
      filter: false,
      width: 180,
      cellRenderer: (row) => {
        const at = lastProvisionedAt[row.schemaTitle];
        return <span>{at ? at.toLocaleString() : t('provisionLists.neverRun')}</span>;
      },
    },
    {
      field: 'colActions',
      headerKey: 'provisionLists.column.actions',
      filter: false,
      sortable: false,
      width: 180,
      cellRenderer: (row) => {
        const schema = SCHEMAS.filter((s) => s.title === row.schemaTitle)[0];
        return (
          <Button
            disabled={isRunning || !schema}
            onClick={() => schema && runProvision([schema], row.schemaTitle)}
          >
            {t('provisionLists.actions.provisionOne')}
          </Button>
        );
      },
    },
  ];

  const renderLogLine = (event: IProvisionEvent, index: number): React.ReactNode => {
    const symbol =
      event.status === 'created'
        ? '✓'
        : event.status === 'removed'
          ? '−'
          : event.status === 'error'
            ? '✗'
            : '—';
    const label =
      event.step === 'list'
        ? event.schemaTitle
        : event.step === 'field'
          ? `${event.schemaTitle}.${event.detail}`
          : `${event.schemaTitle} [${event.detail}]`;
    const statusText =
      event.status === 'error'
        ? t('provisionLists.step.error', { message: event.error ?? '' })
        : event.status;
    return (
      <div key={index} className={`${styles.logLine} ${styles[`logLine_${event.status}`]}`}>
        {symbol} {label} — {statusText}
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <p className={styles.description}>{t('provisionLists.description')}</p>

      <div className={styles.actionsRow}>
        <Button variant="primary" disabled={isRunning} onClick={() => runProvision(SCHEMAS, 'all')}>
          {t('provisionLists.actions.provisionAll')}
        </Button>
        <Button disabled={seeding} onClick={() => setSeedConfirmOpen(true)}>
          {t('provisionLists.actions.seedSampleTasks')}
        </Button>
        {seeding && <span className={styles.logLine_exists}>{t('provisionLists.seedTasks.running')}</span>}
        {!seeding && seedResult && (
          <span className={styles.logLine_created}>
            {t('provisionLists.seedTasks.success', {
              inserted: seedResult.inserted,
              skippedExisting: seedResult.skippedExisting,
            })}
          </span>
        )}
        {!seeding && seedError && (
          <span className={styles.logLine_error}>
            {t('provisionLists.seedTasks.error', { message: seedError })}
          </span>
        )}
      </div>

      <ConfirmDialog
        isOpen={seedConfirmOpen}
        title={t('provisionLists.seedTasks.confirmTitle')}
        message={
          isDevEnv
            ? t('provisionLists.seedTasks.confirmMessage')
            : t('provisionLists.seedTasks.confirmMessageNonDev', {
                environment: configService.getConfig().environment,
              })
        }
        confirmLabel={t('provisionLists.seedTasks.confirm')}
        cancelLabel={t('provisionLists.seedTasks.cancel')}
        destructive={!isDevEnv}
        onConfirm={runSeedTasks}
        onCancel={() => setSeedConfirmOpen(false)}
      />

      <DataGrid<IProvisionRow>
        columns={columns}
        rows={rows}
        loading={loadingStatus}
        onRefresh={fetchStatus}
        getRowId={(row) => row.schemaTitle}
        enableViewToggle={false}
        gridId="admin-provision-lists"
        emptyStateKey="grid.empty.default"
        toolbarTitle={t('provisionLists.panelTitle')}
      />

      <div className={styles.logPanel}>
        <div className={styles.logTitle}>{t('provisionLists.log.title')}</div>
        <div className={styles.logBody}>
          {log.length === 0 ? (
            <span className={styles.logEmpty}>{t('provisionLists.log.empty')}</span>
          ) : (
            log.map(renderLogLine)
          )}
        </div>
        {tally && (
          <div className={styles.tallyBanner}>
            {t('provisionLists.tally', {
              created: tally.created,
              exists: tally.exists,
              removed: tally.removed,
              errors: tally.errors,
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProvisionListsPanel;

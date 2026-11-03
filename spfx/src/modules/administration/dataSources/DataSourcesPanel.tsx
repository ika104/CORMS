import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Button } from '../../../components/common/Button';
import { useServices } from '../../../services/ServiceProvider';
import { useDataSource } from '../../../state/DataSourceContext';
import { useAppDataSourceRefresh } from '../../../state/AppDataSourceRefreshContext';
import {
  DataSourceConfig,
  DataSourceMode,
  FEATURE_KEYS,
  FEATURE_REGISTRY,
  IFeatureMeta,
  MasterMode,
  resolveMode,
} from '../../../services/dataSource/dataSourceConfig';
import { testElasticConnection, testSpRestConnection } from './testConnection';
import {
  AppDataSourceMode,
  DEFAULT_APP_DATA_SOURCE_MODE,
  readAppDataSourceMode,
  saveAppDataSourceMode,
} from '../../../services/appDataSource/appDataSourceConfig';
import { readAppTaskDataSourceMode, saveAppTaskDataSourceMode } from '../../../services/appDataSource/taskDataSourceConfig';
import {
  readAppDelegationDataSourceMode,
  saveAppDelegationDataSourceMode,
} from '../../../services/appDataSource/delegationDataSourceConfig';
import styles from './DataSourcesPanel.module.scss';

// AG Grid derives each column's colId from `field` when none is given explicitly, so every
// column needs a distinct field even though every cellRenderer below reads `row.meta` directly.
interface IFeatureRow {
  meta: IFeatureMeta;
  colFeature: string;
  colConsumedBy: string;
  colDependency: string;
  colTransport: string;
  colMode: string;
  colListName: string;
  colTest: string;
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'success'; count?: number } | { status: 'error'; message?: string };

const MASTER_OPTIONS: { value: MasterMode; labelKey: string }[] = [
  { value: 'mock', labelKey: 'dataSource.master.allMock' },
  { value: 'live', labelKey: 'dataSource.master.allLive' },
  { value: 'per-feature', labelKey: 'dataSource.master.perFeature' },
];

const DataSourcesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { configService, devSettingsService } = useServices();
  const { config, isDevMode, save, reset } = useDataSource();
  const { refreshAppDataSource } = useAppDataSourceRefresh();
  const [draft, setDraft] = React.useState<DataSourceConfig>(config);
  const [testResults, setTestResults] = React.useState<Record<string, TestState>>({});
  const [globalTest, setGlobalTest] = React.useState<TestState>({ status: 'idle' });

  React.useEffect(() => {
    setDraft(config);
  }, [config]);

  // app.correspondenceDataSource (Part 0/4/5/6) — a single CORMS_AdminConfig row read/written
  // via devSettingsService (real SPHttpClient REST — see appDataSourceConfig.ts's file comment
  // for why IAdminConfigService, used here originally, doesn't actually persist), independent of
  // the ds.* draft/save/reset flow above. Saved immediately on toggle, not batched with the
  // "Save" button below, since it has no draft state of its own to stage. refreshAppDataSource()
  // after a successful save tells App.tsx's ResolvedServiceProvider to re-read it immediately,
  // so My Correspondence/Inbox-Sent pick up the change without a page reload.
  const [appDataSourceMode, setAppDataSourceModeState] = React.useState<AppDataSourceMode>(DEFAULT_APP_DATA_SOURCE_MODE);
  const [appDataSourceSaving, setAppDataSourceSaving] = React.useState(false);

  React.useEffect(() => {
    readAppDataSourceMode(devSettingsService)
      .then(setAppDataSourceModeState)
      .catch(() => undefined);
  }, [devSettingsService]);

  const setAppDataSourceMode = (mode: AppDataSourceMode): void => {
    setAppDataSourceSaving(true);
    saveAppDataSourceMode(devSettingsService, mode)
      .then(() => {
        setAppDataSourceModeState(mode);
        setAppDataSourceSaving(false);
        refreshAppDataSource();
      })
      .catch(() => setAppDataSourceSaving(false));
  };

  // app.taskDataSource (Task Inbox Backend task, Part 0/4/6) — a second, independent row in the
  // same "CORMS Application Data" section, same save-immediately/refreshAppDataSource wiring as
  // app.correspondenceDataSource above, its own state so toggling one never touches the other.
  const [appTaskDataSourceMode, setAppTaskDataSourceModeState] = React.useState<AppDataSourceMode>(DEFAULT_APP_DATA_SOURCE_MODE);
  const [appTaskDataSourceSaving, setAppTaskDataSourceSaving] = React.useState(false);

  React.useEffect(() => {
    readAppTaskDataSourceMode(devSettingsService)
      .then(setAppTaskDataSourceModeState)
      .catch(() => undefined);
  }, [devSettingsService]);

  const setAppTaskDataSourceMode = (mode: AppDataSourceMode): void => {
    setAppTaskDataSourceSaving(true);
    saveAppTaskDataSourceMode(devSettingsService, mode)
      .then(() => {
        setAppTaskDataSourceModeState(mode);
        setAppTaskDataSourceSaving(false);
        refreshAppDataSource();
      })
      .catch(() => setAppTaskDataSourceSaving(false));
  };

  // app.delegationDataSource (Delegation & Reassignment Backend task, Part 0/4/6) — a third,
  // independent row in the same "CORMS Application Data" section, same save-immediately/
  // refreshAppDataSource wiring as the two above, its own state so toggling one never touches
  // the others.
  const [appDelegationDataSourceMode, setAppDelegationDataSourceModeState] = React.useState<AppDataSourceMode>(DEFAULT_APP_DATA_SOURCE_MODE);
  const [appDelegationDataSourceSaving, setAppDelegationDataSourceSaving] = React.useState(false);

  React.useEffect(() => {
    readAppDelegationDataSourceMode(devSettingsService)
      .then(setAppDelegationDataSourceModeState)
      .catch(() => undefined);
  }, [devSettingsService]);

  const setAppDelegationDataSourceMode = (mode: AppDataSourceMode): void => {
    setAppDelegationDataSourceSaving(true);
    saveAppDelegationDataSourceMode(devSettingsService, mode)
      .then(() => {
        setAppDelegationDataSourceModeState(mode);
        setAppDelegationDataSourceSaving(false);
        refreshAppDataSource();
      })
      .catch(() => setAppDelegationDataSourceSaving(false));
  };

  const elasticUrl = configService.getConfig().elasticUrl;

  const setMaster = (master: MasterMode): void => {
    setDraft((prev) => ({ ...prev, master }));
  };

  const setFeatureMode = (key: (typeof FEATURE_KEYS)[number], mode: DataSourceMode): void => {
    setDraft((prev) => ({ ...prev, features: { ...prev.features, [key]: mode } }));
  };

  const setListName = (key: (typeof FEATURE_KEYS)[number], value: string): void => {
    setDraft((prev) => ({ ...prev, listNames: { ...prev.listNames, [key]: value } }));
  };

  const runTest = async (meta: IFeatureMeta): Promise<void> => {
    if (!meta.implemented) {
      setTestResults((prev) => ({ ...prev, [meta.key]: { status: 'error', message: t('dataSource.test.notImplemented') } }));
      return;
    }
    setTestResults((prev) => ({ ...prev, [meta.key]: { status: 'testing' } }));
    const result =
      meta.transport === 'elastic'
        ? await testElasticConnection(elasticUrl)
        : await testSpRestConnection(draft.recordsHubSiteUrl, draft.listNames[meta.key]);
    setTestResults((prev) => ({
      ...prev,
      [meta.key]: result.ok ? { status: 'success', count: result.count } : { status: 'error', message: result.message },
    }));
  };

  const runGlobalTest = async (): Promise<void> => {
    setGlobalTest({ status: 'testing' });
    const result = await testSpRestConnection(draft.recordsHubSiteUrl);
    setGlobalTest(result.ok ? { status: 'success' } : { status: 'error', message: result.message });
  };

  // The descriptive columns carry the text they actually display, not a repeat of meta.key, so
  // their per-column header filters (CMS-044 AC9) filter on what the user can see. The three
  // interactive columns (mode toggle / list-name input / test button) keep the key as an inert
  // placeholder — they render controls, and stay unfiltered.
  const rows: IFeatureRow[] = FEATURE_KEYS.map((key) => {
    const meta = FEATURE_REGISTRY[key];
    return {
      meta,
      colFeature: t(meta.labelKey),
      colConsumedBy: meta.consumedBy.join(', '),
      colDependency: meta.dependencyRef,
      colTransport: t(`dataSource.transport.${meta.transport === 'sp-rest' ? 'spRest' : 'elastic'}`),
      colMode: meta.key,
      colListName: meta.key,
      colTest: meta.key,
    };
  });

  const renderTestResult = (state: TestState | undefined): React.ReactNode => {
    if (!state || state.status === 'idle') return null;
    if (state.status === 'testing') return <span className={styles.testResultDisabled}>{t('dataSource.connection.testing')}</span>;
    if (state.status === 'success')
      return (
        <span className={styles.testResultSuccess}>
          {state.count === undefined ? t('dataSource.connection.success') : t('dataSource.test.success', { count: state.count })}
        </span>
      );
    return <span className={styles.testResultError}>{state.message ?? t('dataSource.test.error')}</span>;
  };

  const columns: DataGridColumn<IFeatureRow>[] = React.useMemo(
    () => [
      {
        field: 'colFeature',
        headerKey: 'dataSource.column.feature',
        flex: 2,
        filter: 'text',
        cellRenderer: (row: IFeatureRow) => <span>{t(row.meta.labelKey)}</span>,
      },
      {
        field: 'colConsumedBy',
        headerKey: 'dataSource.column.consumedBy',
        flex: 1,
        filter: 'text',
        cellRenderer: (row: IFeatureRow) => <span>{row.meta.consumedBy.join(', ')}</span>,
      },
      {
        field: 'colDependency',
        headerKey: 'dataSource.column.dependency',
        width: 140,
        filter: 'text',
        cellRenderer: (row: IFeatureRow) => <span>{row.meta.dependencyRef}</span>,
      },
      {
        field: 'colTransport',
        headerKey: 'dataSource.column.transport',
        width: 120,
        filter: 'text',
        cellRenderer: (row: IFeatureRow) => (
          <span className={styles.transportGroup}>
            {t(`dataSource.transport.${row.meta.transport === 'sp-rest' ? 'spRest' : 'elastic'}`)}
          </span>
        ),
      },
      {
        field: 'colMode',
        headerKey: 'dataSource.column.mode',
        width: 140,
        filter: false,
        cellRenderer: (row: IFeatureRow) => {
          const mode = row.meta.lockedMode ?? resolveMode(row.meta.key, draft);
          const disabled = !!row.meta.lockedMode || draft.master !== 'per-feature';
          return (
            <div className={styles.modeToggle}>
              <button
                type="button"
                disabled={disabled}
                className={`${styles.modeToggleOption} ${mode === 'mock' ? styles.modeToggleOptionActive : ''}`}
                onClick={() => setFeatureMode(row.meta.key, 'mock')}
              >
                {t('dataSource.mode.mock')}
              </button>
              <button
                type="button"
                disabled={disabled}
                className={`${styles.modeToggleOption} ${mode === 'live' ? styles.modeToggleOptionActive : ''}`}
                onClick={() => setFeatureMode(row.meta.key, 'live')}
              >
                {t('dataSource.mode.live')}
              </button>
            </div>
          );
        },
      },
      {
        field: 'colListName',
        headerKey: 'dataSource.column.listName',
        flex: 1,
        filter: false,
        cellRenderer: (row: IFeatureRow) =>
          row.meta.acceptsListName === false ? (
            <span className={styles.readOnlyValue}>—</span>
          ) : (
            <input
              type="text"
              className={styles.listNameInput}
              value={draft.listNames[row.meta.key] ?? ''}
              onChange={(e) => setListName(row.meta.key, e.target.value)}
            />
          ),
      },
      {
        field: 'colTest',
        headerKey: 'dataSource.column.test',
        width: 220,
        filter: false,
        cellRenderer: (row: IFeatureRow) => (
          <div className={styles.testCell}>
            <button type="button" className={styles.testButton} onClick={() => runTest(row.meta)}>
              {t('dataSource.connection.test')}
            </button>
            {renderTestResult(testResults[row.meta.key])}
          </div>
        ),
      },
    ],
    [draft, testResults, t]
  );

  return (
    <div className={styles.panel}>
      {isDevMode && (
        <div className={styles.banner}>
          <AlertTriangle size={16} />
          {t('dataSource.devModeBanner')}
        </div>
      )}

      <h2 className={styles.sectionHeading}>{t('dataSource.section.recordsHub')}</h2>
      <p className={styles.sectionHint}>{t('dataSource.section.recordsHubHint')}</p>

      <div className={styles.card}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('dataSource.master.label')}</span>
          <div className={styles.modeToggle}>
            {MASTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.modeToggleOption} ${draft.master === opt.value ? styles.modeToggleOptionActive : ''}`}
                onClick={() => setMaster(opt.value)}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('dataSource.connection.label')}</span>
            <span className={styles.readOnlyValue}>{draft.recordsHubSiteUrl || '—'}</span>
          </div>
          <div className={styles.spacer} />
          <Button onClick={runGlobalTest}>{t('dataSource.connection.test')}</Button>
          <div>{renderTestResult(globalTest)}</div>
        </div>
      </div>

      <DataGrid<IFeatureRow>
        columns={columns}
        rows={rows}
        onRefresh={() => undefined}
        getRowId={(row) => row.meta.key}
        enableViewToggle={false}
        gridId="admin-data-sources"
        emptyStateKey="grid.empty.default"
        toolbarTitle={t('dataSource.panelTitle')}
      />

      <div className={styles.actionsRow}>
        <Button onClick={() => reset()}>{t('dataSource.actions.reset')}</Button>
        <Button variant="primary" onClick={() => save(draft)}>
          {t('dataSource.actions.save')}
        </Button>
      </div>

      <h2 className={styles.sectionHeading}>{t('dataSource.section.app')}</h2>
      <p className={styles.sectionHint}>{t('dataSource.section.appHint')}</p>

      <div className={`${styles.card} ${styles.appSectionCard}`}>
        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('dataSource.appDataSource.feature')}</span>
          </div>
          <div className={styles.spacer} />
          <div className={styles.modeToggle}>
            <button
              type="button"
              disabled={appDataSourceSaving}
              className={`${styles.modeToggleOption} ${appDataSourceMode === 'mock' ? styles.modeToggleOptionActive : ''}`}
              onClick={() => setAppDataSourceMode('mock')}
            >
              {t('dataSource.mode.mock')}
            </button>
            <button
              type="button"
              disabled={appDataSourceSaving}
              className={`${styles.modeToggleOption} ${appDataSourceMode === 'live' ? styles.modeToggleOptionActive : ''}`}
              onClick={() => setAppDataSourceMode('live')}
            >
              {t('dataSource.mode.live')}
            </button>
          </div>
          {appDataSourceSaving && <span className={styles.testResultDisabled}>{t('dataSource.appDataSource.saving')}</span>}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('dataSource.appDataSource.taskFeature')}</span>
          </div>
          <div className={styles.spacer} />
          <div className={styles.modeToggle}>
            <button
              type="button"
              disabled={appTaskDataSourceSaving}
              className={`${styles.modeToggleOption} ${appTaskDataSourceMode === 'mock' ? styles.modeToggleOptionActive : ''}`}
              onClick={() => setAppTaskDataSourceMode('mock')}
            >
              {t('dataSource.mode.mock')}
            </button>
            <button
              type="button"
              disabled={appTaskDataSourceSaving}
              className={`${styles.modeToggleOption} ${appTaskDataSourceMode === 'live' ? styles.modeToggleOptionActive : ''}`}
              onClick={() => setAppTaskDataSourceMode('live')}
            >
              {t('dataSource.mode.live')}
            </button>
          </div>
          {appTaskDataSourceSaving && <span className={styles.testResultDisabled}>{t('dataSource.appDataSource.saving')}</span>}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('dataSource.appDataSource.delegationFeature')}</span>
          </div>
          <div className={styles.spacer} />
          <div className={styles.modeToggle}>
            <button
              type="button"
              disabled={appDelegationDataSourceSaving}
              className={`${styles.modeToggleOption} ${appDelegationDataSourceMode === 'mock' ? styles.modeToggleOptionActive : ''}`}
              onClick={() => setAppDelegationDataSourceMode('mock')}
            >
              {t('dataSource.mode.mock')}
            </button>
            <button
              type="button"
              disabled={appDelegationDataSourceSaving}
              className={`${styles.modeToggleOption} ${appDelegationDataSourceMode === 'live' ? styles.modeToggleOptionActive : ''}`}
              onClick={() => setAppDelegationDataSourceMode('live')}
            >
              {t('dataSource.mode.live')}
            </button>
          </div>
          {appDelegationDataSourceSaving && <span className={styles.testResultDisabled}>{t('dataSource.appDataSource.saving')}</span>}
        </div>
      </div>
    </div>
  );
};

export default DataSourcesPanel;

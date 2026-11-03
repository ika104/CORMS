import * as React from 'react';
import { HashRouter } from 'react-router-dom';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ServiceProvider, IServiceContainer } from '../services/ServiceProvider';
import {
  buildElasticService,
  buildExternalOrgsService,
  buildMetadataService,
  buildNumberingService,
  buildOrgHierarchyService,
  buildRecordsHubService,
  buildTemplatesService,
} from '../services/dataSource/resolveService';
import {
  resolveCorrespondenceDashboardService,
  resolveCorrespondenceListService,
  resolveDelegationService,
  resolveReassignmentService,
  resolveRoutingService,
  resolveClassificationService,
  resolveSubordinateInboxService,
  resolveTaskListService,
  resolveWorkflowMatrixService,
  resolveESignatureService,
} from '../services/appDataSource/resolveAppDataSource';
import { AppDataSourceMode, DEFAULT_APP_DATA_SOURCE_MODE, readAppDataSourceMode } from '../services/appDataSource/appDataSourceConfig';
import { readAppTaskDataSourceMode } from '../services/appDataSource/taskDataSourceConfig';
import { readAppDelegationDataSourceMode } from '../services/appDataSource/delegationDataSourceConfig';
import { LocalizationProvider, useLocale } from '../i18n/LocalizationProvider';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AppShellProvider } from '../state/AppShellContext';
import { AppDataSourceRefreshProvider, useAppDataSourceRefresh } from '../state/AppDataSourceRefreshContext';
import { DataSourceProvider, useDataSource } from '../state/DataSourceContext';
import { FoldersProvider } from '../state/FoldersContext';
import { AppShell } from '../shell/AppShell';
import { AppRoutes } from './routes';
import { createServiceBundle, IServiceBundle } from './bootstrap';

// Theme depends on locale direction, so it must render inside LocalizationProvider.
const ThemedShell: React.FC<{ context: WebPartContext }> = ({ context }) => {
  const { isRtl } = useLocale();
  return (
    <ThemeProvider isRtl={isRtl} spfxContext={context}>
      <FoldersProvider>
        <AppShellProvider>
          <HashRouter>
            <AppShell>
              <AppRoutes />
            </AppShell>
          </HashRouter>
        </AppShellProvider>
      </FoldersProvider>
    </ThemeProvider>
  );
};

// Resolves the mock/live pick for each RecordsHub-backed service from the current
// DataSourceContext config (TASK-03) and publishes the result through ServiceProvider —
// components keep consuming useServices() and never know which one they got.
const ResolvedServiceProvider: React.FC<{ bundle: IServiceBundle; children: React.ReactNode }> = ({
  bundle,
  children,
}) => {
  const { config } = useDataSource();
  const { refreshToken } = useAppDataSourceRefresh();

  // app.correspondenceDataSource (Part 4/5) — a single CORMS_AdminConfig row, not part of
  // DataSourceContext's config blob (see appDataSourceConfig.ts's file comment for why). Read via
  // the live devSettings REST client (not IAdminConfigService — it has no live implementation, so
  // routing this functional toggle through it meant "Live" never actually took effect against a
  // real tenant; found via manual testing). `refreshToken` re-runs this after DataSourcesPanel
  // saves a change, so the already-mounted app picks it up without a full page reload.
  const [appDataSourceMode, setAppDataSourceMode] = React.useState<AppDataSourceMode>(DEFAULT_APP_DATA_SOURCE_MODE);
  React.useEffect(() => {
    readAppDataSourceMode(bundle.devSettings.live)
      .then(setAppDataSourceMode)
      .catch(() => setAppDataSourceMode(DEFAULT_APP_DATA_SOURCE_MODE));
  }, [bundle.devSettings.live, refreshToken]);

  // app.taskDataSource (Part 4) — a sibling toggle, its own CORMS_AdminConfig row, resolved the
  // same way and refreshed by the same refreshToken so DataSourcesPanel's "CORMS Application Data"
  // section can flip either row independently without a full page reload.
  const [appTaskDataSourceMode, setAppTaskDataSourceMode] = React.useState<AppDataSourceMode>(DEFAULT_APP_DATA_SOURCE_MODE);
  React.useEffect(() => {
    readAppTaskDataSourceMode(bundle.devSettings.live)
      .then(setAppTaskDataSourceMode)
      .catch(() => setAppTaskDataSourceMode(DEFAULT_APP_DATA_SOURCE_MODE));
  }, [bundle.devSettings.live, refreshToken]);

  // app.delegationDataSource (Delegation & Reassignment Backend task, Part 4) — a third sibling
  // toggle, its own CORMS_AdminConfig row, resolved/refreshed the same way so DataSourcesPanel's
  // "CORMS Application Data" section can flip any of the three rows independently.
  const [appDelegationDataSourceMode, setAppDelegationDataSourceMode] = React.useState<AppDataSourceMode>(DEFAULT_APP_DATA_SOURCE_MODE);
  React.useEffect(() => {
    readAppDelegationDataSourceMode(bundle.devSettings.live)
      .then(setAppDelegationDataSourceMode)
      .catch(() => setAppDelegationDataSourceMode(DEFAULT_APP_DATA_SOURCE_MODE));
  }, [bundle.devSettings.live, refreshToken]);

  const services = React.useMemo<IServiceContainer>(() => {
    const numberingService = buildNumberingService(config, bundle.numbering.mock, bundle.numbering.live);
    return {
      recordsHubService: buildRecordsHubService(config, bundle.recordsHub.mock, bundle.recordsHub.live),
      sharePointService: bundle.sharePointService,
      existingDocumentService: bundle.existingDocumentService,
      elasticService: buildElasticService(config, bundle.elastic.mock, bundle.elastic.live),
      configService: bundle.configService,
      cacheService: bundle.cacheService,
      metadataService: buildMetadataService(config, bundle.metadata.mock, bundle.metadata.live),
      externalOrgsService: buildExternalOrgsService(config, bundle.externalOrgs.mock, bundle.externalOrgs.live),
      numberingService,
      templatesService: buildTemplatesService(config, bundle.templates.mock, bundle.templates.live),
      folderService: bundle.folderService,
      correspondenceDetailService: bundle.correspondenceDetailService,
      workflowMatrixService: resolveWorkflowMatrixService(appDataSourceMode, bundle.workflowMatrix.mock, bundle.workflowMatrix.live),
      auditTrailService: bundle.auditTrailService,
      adminConfigService: bundle.adminConfigService,
      documentPreviewService: bundle.documentPreviewService,
      translationsService: bundle.translationsService,
      provisioningService: bundle.provisioningService,
      seedTasksService: bundle.seedTasksService,
      roleService: bundle.roleService,
      userPermissionsService: bundle.userPermissionsService,
      navigationService: bundle.navigationService,
      badgeCountService: bundle.badgeCountService,
      correspondenceListService: resolveCorrespondenceListService(
        appDataSourceMode,
        bundle.correspondenceList.mock,
        bundle.correspondenceList.live
      ),
      correspondenceDashboardService: resolveCorrespondenceDashboardService(
        appDataSourceMode,
        bundle.correspondenceDashboard.mock,
        bundle.correspondenceDashboard.live
      ),
      taskListService: resolveTaskListService(appTaskDataSourceMode, bundle.taskList.mock, bundle.taskList.live),
      orgHierarchyService: buildOrgHierarchyService(config, bundle.orgHierarchy.mock, bundle.orgHierarchy.live),
      delegationService: resolveDelegationService(appDelegationDataSourceMode, bundle.delegation.mock, bundle.delegation.live),
      subordinateInboxService: resolveSubordinateInboxService(
        appDelegationDataSourceMode,
        bundle.subordinateInbox.mock,
        bundle.subordinateInbox.live
      ),
      reassignmentService: resolveReassignmentService(appDelegationDataSourceMode, bundle.reassignment.mock, bundle.reassignment.live),
      routingService: resolveRoutingService(appDataSourceMode, bundle.routing.mock, bundle.routing.live),
      classificationService: resolveClassificationService(appDataSourceMode, bundle.classification.mock, bundle.classification.live),
      readReceiptService: bundle.readReceiptService,
      reclassificationService: bundle.reclassificationService,
      approvalTaskService: bundle.approvalTaskService,
      signingService: bundle.signingService,
      eSignatureService: resolveESignatureService(appDataSourceMode, bundle.eSignatureService.mock, bundle.eSignatureService.live),
      bulkActionsService: bundle.bulkActionsService,
      correspondenceService: bundle.correspondenceServiceFactory(numberingService),
      attachmentService: bundle.attachmentService,
      attachmentStorageService: bundle.attachmentStorageService,
      physicalAttachmentService: bundle.physicalAttachmentService,
      devSettingsService: bundle.devSettings.live,
    };
  }, [config, bundle, appDataSourceMode, appTaskDataSourceMode, appDelegationDataSourceMode]);
  return <ServiceProvider services={services}>{children}</ServiceProvider>;
};

export interface IAppProps {
  context: WebPartContext;
}

// Provider composition: AppDataSourceRefreshProvider (has to sit above ResolvedServiceProvider,
// which consumes it) -> DataSourceProvider (owns the mock/live config) -> ResolvedServiceProvider
// (picks concrete service instances per config) -> LocalizationProvider (+ nested ThemeProvider,
// which needs isRtl) -> AppShellContext -> HashRouter -> AppShell.
export const App: React.FC<IAppProps> = ({ context }) => {
  const bundle = React.useMemo(() => createServiceBundle(context), [context]);
  return (
    <AppDataSourceRefreshProvider>
      <DataSourceProvider
        liveService={bundle.devSettings.live}
        fallbackService={bundle.devSettings.fallback}
        cacheService={bundle.cacheService}
      >
        <ResolvedServiceProvider bundle={bundle}>
          <LocalizationProvider>
            <ThemedShell context={context} />
          </LocalizationProvider>
        </ResolvedServiceProvider>
      </DataSourceProvider>
    </AppDataSourceRefreshProvider>
  );
};

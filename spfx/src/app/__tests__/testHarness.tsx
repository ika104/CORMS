import * as React from 'react';
import { HashRouter } from 'react-router-dom';
import { IServiceContainer } from '../../services/ServiceProvider';
import { ServiceProvider } from '../../services/ServiceProvider';
import { LocalizationProvider, useLocale } from '../../i18n/LocalizationProvider';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { AppShellProvider } from '../../state/AppShellContext';
import { AppDataSourceRefreshProvider } from '../../state/AppDataSourceRefreshContext';
import { FoldersProvider } from '../../state/FoldersContext';
import { AppShell } from '../../shell/AppShell';
import { AppRoutes } from '../routes';
import { RecordsHubServiceMock } from '../../services/recordsHub/RecordsHubService.mock';
import { ElasticServiceMock } from '../../services/elastic/ElasticService.mock';
import { ExistingDocumentServiceMock } from '../../services/existingDocument/ExistingDocumentService.mock';
import { ConfigService } from '../../services/config/ConfigService';
import { CacheService } from '../../services/cache/CacheService';
import { MetadataServiceMock } from '../../services/metadata/MetadataService.mock';
import { ExternalOrgsServiceMock } from '../../services/externalOrgs/ExternalOrgsService.mock';
import { NumberingServiceMock } from '../../services/numbering/NumberingService.mock';
import { TemplatesServiceMock } from '../../services/templates/TemplatesService.mock';
import { TaskListServiceMock } from '../../services/taskList/TaskList.mock';
import { FolderServiceMock } from '../../services/folders/FolderService.mock';
import { CorrespondenceDetailServiceMock } from '../../services/correspondenceDetail/CorrespondenceDetailService.mock';
import { WorkflowMatrixServiceMock } from '../../services/workflowMatrix/WorkflowMatrixService.mock';
import { AuditTrailServiceMock } from '../../services/auditTrail/AuditTrailService.mock';
import { AdminConfigServiceMock } from '../../services/adminConfig/AdminConfigService.mock';
import { TranslationsServiceMock } from '../../services/translations/TranslationsService.mock';
import { RoleServiceMock } from '../../services/role/RoleService.mock';
import { UserPermissionsServiceMock } from '../../services/userPermissions/UserPermissionsService.mock';
import { NavigationServiceMock } from '../../services/navigation/NavigationService.mock';
import { BadgeCountServiceMock } from '../../services/navigation/BadgeCountService.mock';
import { CorrespondenceListServiceMock } from '../../services/correspondenceList/CorrespondenceList.mock';
import { CorrespondenceDashboardServiceMock } from '../../services/correspondenceDashboard/CorrespondenceDashboardService.mock';
import { ReadReceiptServiceMock } from '../../services/readReceipts/ReadReceiptService.mock';
import { ReclassificationServiceMock } from '../../services/reclassification/ReclassificationService.mock';
import { ApprovalTaskServiceMock } from '../../services/approvalTasks/ApprovalTaskService.mock';
import { SigningServiceMock } from '../../services/signing/SigningService.mock';
import { ESignatureServiceMock } from '../../services/esignature/ESignatureService.mock';
import { BulkActionsServiceMock } from '../../services/bulkActions/BulkActionsService.mock';
import { OrgHierarchyServiceMock } from '../../services/orgHierarchy/OrgHierarchyService.mock';
import { DelegationServiceMock } from '../../services/delegation/DelegationService.mock';
import { SubordinateInboxServiceMock } from '../../services/subordinateInbox/SubordinateInboxService.mock';
import { ReassignmentServiceMock } from '../../services/reassignment/ReassignmentService.mock';
import { RoutingServiceMock } from '../../services/routing/RoutingService.mock';
import { ClassificationServiceMock } from '../../services/classification/ClassificationService.mock';

/**
 * Mirrors src/app/App.tsx without the SPFx web-part context, so the shell can be
 * rendered in jsdom. SharePointService is the only service that needs a live SPFx
 * context, so it is stubbed here.
 */
export function createTestServices(): IServiceContainer {
  return {
    recordsHubService: new RecordsHubServiceMock(),
    sharePointService: {
      getWebTitle: () => Promise.resolve('CORMS DEV'),
      searchPeople: () => Promise.resolve([]),
    },
    existingDocumentService: new ExistingDocumentServiceMock(),
    elasticService: new ElasticServiceMock(),
    configService: new ConfigService(),
    cacheService: new CacheService(),
    metadataService: new MetadataServiceMock(),
    externalOrgsService: new ExternalOrgsServiceMock(),
    numberingService: new NumberingServiceMock(),
    templatesService: new TemplatesServiceMock(),
    taskListService: new TaskListServiceMock(),
    folderService: new FolderServiceMock(),
    correspondenceDetailService: new CorrespondenceDetailServiceMock(),
    workflowMatrixService: new WorkflowMatrixServiceMock(),
    auditTrailService: new AuditTrailServiceMock(),
    adminConfigService: new AdminConfigServiceMock(
      new ConfigService().getConfig().powerAppsTaskFormUrl,
      new ConfigService().getConfig().recordsHubSiteUrl
    ),
    documentPreviewService: {
      getPreviewImages: () => Promise.resolve(undefined),
      getAnnotations: () => Promise.resolve(undefined),
      addAnnotations: () => Promise.resolve(false),
      addAndReadBackAnnotations: () => Promise.resolve(undefined),
      removeAnnotations: () => Promise.resolve(false),
    },
    translationsService: new TranslationsServiceMock(),
    // ProvisioningService needs a real SPFx context (PnPjs), same reasoning as
    // sharePointService above — stubbed here with an empty status/no-op run.
    provisioningService: {
      getStatus: () => Promise.resolve([]),
      provisionAll: () => Promise.resolve({ created: 0, exists: 0, removed: 0, errors: 0 }),
    },
    // Task Inbox Backend task Part 5 — real SPFx context needed (PnPjs), same reasoning as
    // provisioningService above.
    seedTasksService: {
      run: () => Promise.resolve({ inserted: 0, skippedExisting: 0, total: 0 }),
    },
    // Epic 1 — always live in production (bootstrap.ts); these mocks exist only so jsdom
    // component tests can render a ServiceProvider without a real SPFx/PnPjs context, same
    // reasoning as sharePointService/provisioningService above.
    roleService: new RoleServiceMock(),
    userPermissionsService: new UserPermissionsServiceMock(),
    navigationService: new NavigationServiceMock(),
    badgeCountService: new BadgeCountServiceMock(),
    correspondenceListService: new CorrespondenceListServiceMock(),
    correspondenceDashboardService: new CorrespondenceDashboardServiceMock(),
    readReceiptService: new ReadReceiptServiceMock(),
    reclassificationService: new ReclassificationServiceMock(),
    approvalTaskService: new ApprovalTaskServiceMock(),
    signingService: new SigningServiceMock(),
    eSignatureService: new ESignatureServiceMock(),
    bulkActionsService: new BulkActionsServiceMock(),
    // Delegation & Reassignment Backend task — always live in production (bootstrap.ts +
    // App.tsx's resolveDelegationService/buildOrgHierarchyService); stubbed here for the same
    // jsdom-without-SPFx reason as roleService/navigationService above.
    orgHierarchyService: new OrgHierarchyServiceMock(),
    delegationService: new DelegationServiceMock(),
    subordinateInboxService: new SubordinateInboxServiceMock(),
    reassignmentService: new ReassignmentServiceMock(),
    routingService: new RoutingServiceMock(),
    classificationService: new ClassificationServiceMock(),
    // Create Correspondence backend task — always live in production (bootstrap.ts +
    // App.tsx's correspondenceServiceFactory, since it needs a resolved ds.numbering instance);
    // stubbed here for the same jsdom-without-SPFx reason as provisioningService above.
    correspondenceService: {
      create: () => Promise.resolve({ id: '1', status: 'Draft', dateCreated: '2026-01-01T00:00:00.000Z' }),
      getDraftForEdit: () => Promise.resolve(undefined),
      setPendingResponse: () => Promise.resolve(),
    },
    attachmentService: {
      create: (input) => Promise.resolve({ id: '1', isMainLetter: false, ...input }),
      list: () => Promise.resolve([]),
      setMainLetter: () => Promise.resolve(),
      defaultMainLetterIfNone: () => Promise.resolve(),
      recordQualityOverride: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
    attachmentStorageService: {
      uploadFile: (correspondenceId, fileName) =>
        Promise.resolve({
          fileName,
          serverRelativeUrl: `/CORMS_Attachments/${correspondenceId}/${fileName}`,
        }),
      listFiles: () => Promise.resolve([]),
    },
    physicalAttachmentService: {
      create: (input) => Promise.resolve({ id: '1', resourceIdentifier: 'PHY-2026-0001', ...input }),
      getByCorrespondence: () => Promise.resolve([]),
      search: () => Promise.resolve([]),
    },
    // Always live in production (bundle.devSettings.live) — stubbed for the same
    // jsdom-without-SPFx reason as provisioningService/sharePointService above.
    devSettingsService: {
      getSettings: () => Promise.resolve([]),
      saveSettings: () => Promise.resolve(),
    },
  };
}

const ThemedShell: React.FC = () => {
  const { isRtl } = useLocale();
  return (
    <ThemeProvider isRtl={isRtl}>
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

export const TestApp: React.FC<{ services?: IServiceContainer }> = ({ services }) => (
  <AppDataSourceRefreshProvider>
    <ServiceProvider services={services ?? createTestServices()}>
      <LocalizationProvider>
        <ThemedShell />
      </LocalizationProvider>
    </ServiceProvider>
  </AppDataSourceRefreshProvider>
);

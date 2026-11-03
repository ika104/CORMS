import * as React from 'react';
import {
  IAdminConfigService,
  IDocumentPreviewService,
  IAttachmentService,
  IAuditTrailService,
  IBadgeCountService,
  IBulkActionsService,
  ICacheService,
  ITranslationsService,
  IConfigService,
  ICorrespondenceDetailService,
  ICorrespondenceListService,
  ICorrespondenceDashboardService,
  ICorrespondenceService,
  IAttachmentStorageService,
  IPhysicalAttachmentService,
  IDevSettingsService,
  IElasticService,
  IExternalOrgsService,
  IFolderService,
  IMetadataService,
  ITaskListService,
  INavigationService,
  INumberingService,
  IProvisioningService,
  ISeedTasksService,
  IReadReceiptService,
  IReclassificationService,
  IRecordsHubService,
  IRoleService,
  IUserPermissionsService,
  ISharePointService,
  IExistingDocumentService,
  ITemplatesService,
  IWorkflowMatrixService,
  IOrgHierarchyService,
  IDelegationService,
  ISubordinateInboxService,
  IReassignmentService,
  IRoutingService,
  IClassificationService,
  IApprovalTaskService,
  ISigningService,
  IESignatureService,
} from './interfaces';

export interface IServiceContainer {
  recordsHubService: IRecordsHubService;
  sharePointService: ISharePointService;
  /** Create Correspondence → Existing Document tab: browse allowed sites/libraries/documents. */
  existingDocumentService: IExistingDocumentService;
  elasticService: IElasticService;
  configService: IConfigService;
  cacheService: ICacheService;
  metadataService: IMetadataService;
  externalOrgsService: IExternalOrgsService;
  numberingService: INumberingService;
  templatesService: ITemplatesService;
  folderService: IFolderService;
  correspondenceDetailService: ICorrespondenceDetailService;
  workflowMatrixService: IWorkflowMatrixService;
  auditTrailService: IAuditTrailService;
  adminConfigService: IAdminConfigService;
  documentPreviewService: IDocumentPreviewService;
  translationsService: ITranslationsService;
  provisioningService: IProvisioningService;
  seedTasksService: ISeedTasksService;
  // Epic 1 — Workspace Shell & Navigation backend task. Always live, no ds.* mock/live toggle —
  // CORMS-owned data, unlike the RecordsHub-backed services above.
  roleService: IRoleService;
  /** CMS-055 AC3 — per-user permission (PermissionsJson) admin store. Always live (CORMS-owned). */
  userPermissionsService: IUserPermissionsService;
  navigationService: INavigationService;
  badgeCountService: IBadgeCountService;
  // Create Correspondence backend task Part 4/5 — the exception to "always live" above: gated by
  // app.correspondenceDataSource (not a ds.* toggle) so My Correspondence/Inbox-Sent can render
  // the earlier UI task's mock dataset until the team explicitly flips to live. Already resolved
  // to the right instance by App.tsx's ResolvedServiceProvider — this screen never sees the mock
  // instance directly.
  correspondenceListService: ICorrespondenceListService;
  correspondenceDashboardService: ICorrespondenceDashboardService;
  // Task Inbox Backend task (CMS-049 Part 4) — same "already resolved by App.tsx's
  // ResolvedServiceProvider per app.taskDataSource" wiring as the two above. Supersedes the
  // earlier UI-only myTasksService (mock-only, no toggle).
  taskListService: ITaskListService;
  readReceiptService: IReadReceiptService;
  reclassificationService: IReclassificationService;
  /** CMS-006 — SharePoint Task-based approval routing store (CORMS_ApprovalTasks). Always live
   * (CORMS-owned), like reclassificationService/roleService. */
  approvalTaskService: IApprovalTaskService;
  /** CMS-007 — signing dashboard store (CORMS_SigningSessions). Always live (CORMS-owned). */
  signingService: ISigningService;
  // CMS-007 e-signature slice — provider-independent Power Automate flow bridge.
  eSignatureService: IESignatureService;
  bulkActionsService: IBulkActionsService;
  // Create Correspondence backend task (CMS-001/002/003) — also always live, no ds.* toggle.
  correspondenceService: ICorrespondenceService;
  attachmentService: IAttachmentService;
  attachmentStorageService: IAttachmentStorageService;
  physicalAttachmentService: IPhysicalAttachmentService;
  // Always the live CORMS_AdminConfig REST client (bundle.devSettings.live), never toggled —
  // exposed generically so DataSourcesPanel can read/write app.correspondenceDataSource without
  // going through IAdminConfigService, which has no live implementation (see
  // appDataSourceConfig.ts's file comment for why that mattered).
  devSettingsService: IDevSettingsService;
  // Delegation & Reassignment Backend task (CMS-017/018/019). orgHierarchyService is a ds.*
  // toggle-resolved instance (RecordsHub-owned reporting-line data, buildOrgHierarchyService in
  // App.tsx). delegationService/subordinateInboxService/reassignmentService are resolved together
  // by app.delegationDataSource (not a ds.* toggle — CORMS owns this data), same "already resolved
  // by App.tsx's ResolvedServiceProvider" wiring as correspondenceListService/taskListService.
  orgHierarchyService: IOrgHierarchyService;
  delegationService: IDelegationService;
  subordinateInboxService: ISubordinateInboxService;
  reassignmentService: IReassignmentService;
  routingService: IRoutingService;
  /** CMS-010 — persists + audits a triage classify (AC5) / amend (AC9). */
  classificationService: IClassificationService;
}

const ServiceContext = React.createContext<IServiceContainer | undefined>(undefined);

export interface IServiceProviderProps {
  services: IServiceContainer;
  children: React.ReactNode;
}

export const ServiceProvider: React.FC<IServiceProviderProps> = ({ services, children }) => (
  <ServiceContext.Provider value={services}>{children}</ServiceContext.Provider>
);

export function useServices(): IServiceContainer {
  const ctx = React.useContext(ServiceContext);
  if (!ctx) {
    throw new Error('useServices must be used within a ServiceProvider');
  }
  return ctx;
}

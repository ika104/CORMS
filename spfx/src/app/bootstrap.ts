import { WebPartContext } from '@microsoft/sp-webpart-base';
import { RecordsHubServiceMock } from '../services/recordsHub/RecordsHubService.mock';
import { RecordsHubServiceLive } from '../services/recordsHub/RecordsHubService.live';
import { ElasticServiceMock } from '../services/elastic/ElasticService.mock';
import { ElasticServiceLive } from '../services/elastic/ElasticService.live';
import { SharePointService } from '../services/sharepoint/SharePointService';
import { ExistingDocumentServiceLive } from '../services/existingDocument/ExistingDocumentService.live';
import { ConfigService } from '../services/config/ConfigService';
import { CacheService } from '../services/cache/CacheService';
import { DevSettingsServiceLive } from '../services/devSettings/DevSettingsService.live';
import { DevSettingsServiceLocalStorage } from '../services/devSettings/DevSettingsService.localStorage';
import { MetadataServiceMock } from '../services/metadata/MetadataService.mock';
import { MetadataServiceLive } from '../services/metadata/MetadataService.live';
import { ExternalOrgsServiceMock } from '../services/externalOrgs/ExternalOrgsService.mock';
import { ExternalOrgsServiceLive } from '../services/externalOrgs/ExternalOrgsService.live';
import { NumberingServiceMock } from '../services/numbering/NumberingService.mock';
import { NumberingServiceLive } from '../services/numbering/NumberingService.live';
import { TemplatesServiceMock } from '../services/templates/TemplatesService.mock';
import { TemplatesServiceLive } from '../services/templates/TemplatesService.live';
import { TaskListServiceMock } from '../services/taskList/TaskList.mock';
import { TaskListServiceLive } from '../services/taskList/TaskList.live';
import { FolderServiceLive } from '../services/folders/FolderService.live';
import { CorrespondenceDetailServiceLive } from '../services/correspondenceDetail/CorrespondenceDetailService.live';
import { WorkflowMatrixServiceMock } from '../services/workflowMatrix/WorkflowMatrixService.mock';
import { WorkflowMatrixServiceLive } from '../services/workflowMatrix/WorkflowMatrixService.live';
import { AuditTrailServiceLive } from '../services/auditTrail/AuditTrailService.live';
import { AdminConfigServiceLive } from '../services/adminConfig/AdminConfigService.live';
import { DocumentPreviewService } from '../services/documentPreview/DocumentPreviewService';
import { TranslationsServiceLive } from '../services/translations/TranslationsService.live';
import { ProvisioningService } from '../services/provisioning/ProvisioningService';
import { SeedTasksService } from '../scripts/seedTasks';
import { RoleServiceLive } from '../services/role/RoleService.live';
import { UserPermissionsServiceLive } from '../services/userPermissions/UserPermissionsService.live';
import { NavigationServiceLive } from '../services/navigation/NavigationService.live';
import { BadgeCountServiceLive } from '../services/navigation/BadgeCountService.live';
import { CorrespondenceListServiceLive } from '../services/correspondenceList/CorrespondenceList.live';
import { CorrespondenceListServiceMock } from '../services/correspondenceList/CorrespondenceList.mock';
import { CorrespondenceDashboardServiceLive } from '../services/correspondenceDashboard/CorrespondenceDashboardService.live';
import { CorrespondenceDashboardServiceMock } from '../services/correspondenceDashboard/CorrespondenceDashboardService.mock';
import { ReadReceiptServiceLive } from '../services/readReceipts/ReadReceiptService.live';
import { ReclassificationServiceLive } from '../services/reclassification/ReclassificationService.live';
import { ApprovalTaskServiceLive } from '../services/approvalTasks/ApprovalTaskService.live';
import { SigningServiceLive } from '../services/signing/SigningService.live';
import { ESignatureServiceLive } from '../services/esignature/ESignatureService.live';
import { ESignatureServiceMock } from '../services/esignature/ESignatureService.mock';
import { BulkActionsServiceLive } from '../services/bulkActions/BulkActionsService.live';
import { CorrespondenceServiceLive } from '../services/correspondence/CorrespondenceService.live';
import { AttachmentServiceLive } from '../services/attachments/AttachmentService.live';
import { AttachmentStorageServiceLive } from '../services/attachments/AttachmentStorageService.live';
import { PhysicalAttachmentServiceLive } from '../services/physicalAttachments/PhysicalAttachmentService.live';
import { OrgHierarchyServiceMock } from '../services/orgHierarchy/OrgHierarchyService.mock';
import { OrgHierarchyServiceLive } from '../services/orgHierarchy/OrgHierarchyService.live';
import { DelegationServiceMock } from '../services/delegation/DelegationService.mock';
import { DelegationServiceLive } from '../services/delegation/DelegationService.live';
import { SubordinateInboxServiceMock } from '../services/subordinateInbox/SubordinateInboxService.mock';
import { SubordinateInboxServiceLive } from '../services/subordinateInbox/SubordinateInboxService.live';
import { ReassignmentServiceMock } from '../services/reassignment/ReassignmentService.mock';
import { ReassignmentServiceLive } from '../services/reassignment/ReassignmentService.live';
import { RoutingServiceMock } from '../services/routing/RoutingService.mock';
import { RoutingServiceLive } from '../services/routing/RoutingService.live';
import { ClassificationServiceMock } from '../services/classification/ClassificationService.mock';
import { ClassificationServiceLive } from '../services/classification/ClassificationService.live';
import {
  IAdminConfigService,
  IDocumentPreviewService,
  IAttachmentService,
  IAttachmentStorageService,
  IPhysicalAttachmentService,
  IAuditTrailService,
  IBadgeCountService,
  IBulkActionsService,
  ITranslationsService,
  ICorrespondenceDetailService,
  ICorrespondenceListService,
  ICorrespondenceDashboardService,
  ICorrespondenceService,
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
} from '../services/interfaces';

export interface IServiceBundle {
  configService: ConfigService;
  cacheService: CacheService;
  sharePointService: SharePointService;
  existingDocumentService: IExistingDocumentService;
  recordsHub: { mock: IRecordsHubService; live: IRecordsHubService };
  elastic: { mock: IElasticService; live: IElasticService };
  devSettings: { live: IDevSettingsService; fallback: IDevSettingsService };
  metadata: { mock: IMetadataService; live: IMetadataService };
  externalOrgs: { mock: IExternalOrgsService; live: IExternalOrgsService };
  numbering: { mock: INumberingService; live: INumberingService };
  templates: { mock: ITemplatesService; live: ITemplatesService };
  folderService: IFolderService;
  correspondenceDetailService: ICorrespondenceDetailService;
  // CMS-012 — Routing Matrix rules; resolved in App.tsx via app.correspondenceDataSource
  // (resolveWorkflowMatrixService), the same mode as routing and the triage screen.
  workflowMatrix: { mock: IWorkflowMatrixService; live: IWorkflowMatrixService };
  auditTrailService: IAuditTrailService;
  adminConfigService: IAdminConfigService;
  // Correspondence Detail → Preview tab (GroupDocs server-side viewer). Always live, CORMS-owned
  // integration reading its endpoint URL from CORMS_AdminConfig — no mock/live toggle.
  documentPreviewService: IDocumentPreviewService;
  translationsService: ITranslationsService;
  provisioningService: IProvisioningService;
  // Task Inbox Backend task Part 5 — deliberately separate from provisioningService above (schema
  // creation only, never sample data). Same "real SPFx context, no mock/live pair" wiring.
  seedTasksService: ISeedTasksService;
  // Epic 1 — Workspace Shell & Navigation backend task. Always live, no mock/live pair — CORMS
  // owns this data outright, unlike the RecordsHub-backed {mock, live} pairs above.
  roleService: IRoleService;
  // CMS-055 AC3 — per-user PermissionsJson admin store; always live (CORMS-owned).
  userPermissionsService: IUserPermissionsService;
  navigationService: INavigationService;
  badgeCountService: IBadgeCountService;
  // Create Correspondence backend task Part 4/5 — the first CORMS-owned services to get a
  // mock/live pair, gated by app.correspondenceDataSource (NOT a ds.* toggle — see
  // src/services/appDataSource/appDataSourceConfig.ts) rather than always-live like the rest of
  // this block. App.tsx's ResolvedServiceProvider resolves which one serves each screen.
  correspondenceList: { mock: ICorrespondenceListService; live: ICorrespondenceListService };
  correspondenceDashboard: { mock: ICorrespondenceDashboardService; live: ICorrespondenceDashboardService };
  // Task Inbox Backend task (CMS-049/050/052 Part 4) — same "app-owned mock/live pair, gated by
  // its own app.taskDataSource key (not app.correspondenceDataSource, not a ds.* toggle)" shape as
  // correspondenceList/correspondenceDashboard above. Supersedes the earlier UI-only
  // myTasksService/IMyTasksService (mock-only, no live pair).
  taskList: { mock: ITaskListService; live: ITaskListService };
  readReceiptService: IReadReceiptService;
  reclassificationService: IReclassificationService;
  approvalTaskService: IApprovalTaskService;
  signingService: ISigningService;
  eSignatureService: { mock: IESignatureService; live: IESignatureService };
  bulkActionsService: IBulkActionsService;
  // Create Correspondence backend task (CMS-001) — a factory, not a built instance, because
  // CorrespondenceServiceLive needs the *resolved* ds.numbering instance (mock or live, per the
  // existing toggle), which isn't known until DataSourceContext's config loads — App.tsx's
  // ResolvedServiceProvider calls this once it has that instance. See CorrespondenceService.live.ts's
  // file comment.
  correspondenceServiceFactory: (numberingService: INumberingService) => ICorrespondenceService;
  attachmentService: IAttachmentService;
  attachmentStorageService: IAttachmentStorageService;
  physicalAttachmentService: IPhysicalAttachmentService;
  // Delegation & Reassignment Backend task (CMS-017/018/019). orgHierarchy is a ds.* toggle pair
  // (RecordsHub-owned reporting-line data, resolved via resolveService.ts's buildOrgHierarchyService
  // in App.tsx, same shape as recordsHub/metadata/etc above). delegation/subordinateInbox/
  // reassignment are CORMS-owned data behind the app.delegationDataSource toggle (not a ds.*
  // FeatureKey — see delegationDataSourceConfig.ts), resolved in App.tsx alongside
  // correspondenceList/taskList. One toggle drives all three — they're one screen-pair's data.
  orgHierarchy: { mock: IOrgHierarchyService; live: IOrgHierarchyService };
  delegation: { mock: IDelegationService; live: IDelegationService };
  subordinateInbox: { mock: ISubordinateInboxService; live: ISubordinateInboxService };
  reassignment: { mock: IReassignmentService; live: IReassignmentService };
  // CMS-011 — routing writes to CORMS_Correspondence, resolved in App.tsx via
  // app.correspondenceDataSource (resolveRoutingService), same mode as the triage screen's data.
  routing: { mock: IRoutingService; live: IRoutingService };
  // CMS-010 — classify/amend writes to CORMS_Correspondence, resolved in App.tsx via
  // app.correspondenceDataSource, same mode as routing and the triage screen's data.
  classification: { mock: IClassificationService; live: IClassificationService };
}

// Single place where interface -> implementation bindings live — both mock and live, for every
// RecordsHub-backed capability (TASK-03). Which one actually serves a given feature at runtime is
// decided by resolveService.ts, driven by the DataSourceContext config; no component may import a
// concrete service directly.
export function createServiceBundle(context: WebPartContext): IServiceBundle {
  const configService = new ConfigService();
  const config = configService.getConfig();
  const cacheService = new CacheService();
  // Built once, up front, and reused by both `devSettings.live` and `adminConfigService` below —
  // one real SPHttpClient REST client against CORMS_AdminConfig, not two. Built before recordsHubLive
  // so the RecordsHub site URL can be resolved live from Admin Config rather than a static constant.
  const devSettingsLive = new DevSettingsServiceLive(context, config.siteUrl);
  // Auditing has one append-only Elasticsearch transport for the whole application. Reusing this
  // instance keeps the global trail, correspondence detail, and every mutation service on the
  // same sslaudit configuration and prevents private SharePoint audit writers from diverging.
  const auditTrailLive = new AuditTrailServiceLive(context, devSettingsLive);
  // Built once, up front, so every always-live Epic 1 service below can read the acting user's
  // clearance tier through it (getCurrentUser().clearanceTier) without waiting on the
  // DataSourceContext-driven mock/live pick that recordsHub.live/mock below still goes through
  // for the rest of the app — see CorrespondenceList.live.ts's file comment for why. The RecordsHub
  // site URL comes from CORMS_AdminConfig (via devSettingsLive), falling back to config.recordsHubSiteUrl
  // only when the admin value is unset — so a tenant move is an Admin Config edit, not a redeploy.
  const recordsHubLive = new RecordsHubServiceLive(
    context,
    config.recordsHubSiteUrl,
    'CORMS_Menu',
    devSettingsLive
  );
  // Built once, up front, and reused by both the `orgHierarchy` bundle slot and
  // `subordinateInbox.live`'s injected dependency below — one instance, not two.
  const orgHierarchyLive = new OrgHierarchyServiceLive(context, config.siteUrl);

  return {
    configService,
    cacheService,
    sharePointService: new SharePointService(context),
    // Create Correspondence → Existing Document: browses allowed sites (from CORMS_AdminConfig via
    // devSettingsLive) and their libraries/documents. Always live — cross-site SharePoint reads.
    existingDocumentService: new ExistingDocumentServiceLive(context, devSettingsLive),
    recordsHub: {
      // Passing context lets the mock service still resolve the real signed-in user's
      // name/email/photo/job title (see resolveLiveIdentity) — identity is never toggled
      // mock/live, only nav structure and correspondence data are.
      mock: new RecordsHubServiceMock(context),
      live: recordsHubLive,
    },
    elastic: {
      mock: new ElasticServiceMock(),
      // Endpoint/API key/index are read live from CORMS_AdminConfig (integration.elastic*), so an
      // Elastic move is an Admin Config edit, not a redeploy — config.elasticUrl is no longer used.
      // The site URL lets the service resolve CORMS's own per-site content index from the
      // sharepoint_sites registry when integration.elasticIndex is left blank.
      live: new ElasticServiceLive(devSettingsLive, config.siteUrl),
    },
    devSettings: {
      // CORMS_AdminConfig is a CORMS-owned admin list (Sprint 1 list-provisioning task,
      // superseding the earlier CORMS_DevSettings naming) — assumed to live on the app's own
      // site, not the RecordsHub site. TODO(confirm) per TASK-04 §8 item 1.
      live: devSettingsLive,
      fallback: new DevSettingsServiceLocalStorage(),
    },
    provisioningService: new ProvisioningService(context, config.siteUrl),
    seedTasksService: new SeedTasksService(context, config.siteUrl),
    metadata: {
      mock: new MetadataServiceMock(),
      // Create Correspondence → RecordsHub integration: the live services resolve their RecordsHub
      // list URLs / admin JSON from CORMS_AdminConfig at call time (via devSettingsLive), so a
      // tenant move is an Admin Config edit, not a redeploy. config.recordsHubSiteUrl stays only as
      // the fallback host for the still-CORMS_Metadata-backed fields (originating fns, recipients).
      live: new MetadataServiceLive(context, devSettingsLive, config.recordsHubSiteUrl),
    },
    externalOrgs: {
      mock: new ExternalOrgsServiceMock(),
      // External orgs are managed as CORMS_AdminConfig JSON, not a RecordsHub list — no SP site.
      live: new ExternalOrgsServiceLive(devSettingsLive),
    },
    numbering: {
      mock: new NumberingServiceMock(),
      live: new NumberingServiceLive(context, devSettingsLive, config.recordsHubSiteUrl),
    },
    templates: {
      mock: new TemplatesServiceMock(),
      // CORMS_Templates is CORMS-owned and provisioned on CORMS's own site — use config.siteUrl, not
      // recordsHubSiteUrl (which resolves to the tenant root, where the list doesn't exist).
      live: new TemplatesServiceLive(context, config.siteUrl),
    },
    // Custom folders are user-local CORMS data, not a RecordsHub data source — always live now
    // (Epic 1 Part 5), same "always live, no toggle" wiring as the block below.
    folderService: new FolderServiceLive(context, config.siteUrl),
    // Epic 1 Part 3 — correspondence/timeline remain SharePoint-backed; audit reads and writes are
    // delegated to the shared Elasticsearch service. Clearance still resolves from CORMS_UserRoles.
    correspondenceDetailService: new CorrespondenceDetailServiceLive(context, config.siteUrl, auditTrailLive),
    // CMS-012 — mock (session) or the real CORMS_WorkflowMatrix list, chosen by
    // app.correspondenceDataSource in App.tsx.
    workflowMatrix: {
      mock: new WorkflowMatrixServiceMock(),
      live: new WorkflowMatrixServiceLive(context, config.siteUrl),
    },
    // Global and per-item auditing use the same live append-only Elasticsearch index. The UI's
    // chain-status field remains a compatibility display value, not a cryptographic guarantee.
    auditTrailService: auditTrailLive,
    // Task Inbox Backend task — was mock-only (AdminConfigServiceMock, a static JSON fixture
    // never actually persisted anywhere) since the original CMS-055/056 task; now real
    // CORMS_AdminConfig reads/writes via the same devSettingsLive client, so this screen
    // genuinely reflects (and can edit) the same list Provision Lists seeds and Data Sources
    // partially surfaces — see AdminConfigService.live.ts's file comment.
    adminConfigService: new AdminConfigServiceLive(devSettingsLive),
    documentPreviewService: new DocumentPreviewService(devSettingsLive),
    // No live translations store yet (CMS-056 is UI-only for now) — mock-only, same reasoning
    // as workflowMatrixService above.
    // Live: the admin-managed label JSON is stored in CORMS_AdminConfig (translations.{code}) via
    // the same devSettings list every admin setting uses, so labels are editable from the
    // Translations tab without a redeploy. See i18n/runtimeTranslations.ts for the runtime merge.
    translationsService: new TranslationsServiceLive(devSettingsLive),

    // Epic 1 — Workspace Shell & Navigation backend task (CMS-038/039/040/044/054/057). Always
    // live, no mock/live pair — CORMS owns this data outright.
    roleService: new RoleServiceLive(context, config.siteUrl),
    userPermissionsService: new UserPermissionsServiceLive(context, config.siteUrl),
    navigationService: new NavigationServiceLive(context, config.siteUrl, recordsHubLive),
    badgeCountService: new BadgeCountServiceLive(context, config.siteUrl, recordsHubLive),
    correspondenceList: {
      mock: new CorrespondenceListServiceMock(),
      live: new CorrespondenceListServiceLive(context, config.siteUrl),
    },
    correspondenceDashboard: {
      mock: new CorrespondenceDashboardServiceMock(),
      live: new CorrespondenceDashboardServiceLive(context, config.siteUrl),
    },
    taskList: {
      mock: new TaskListServiceMock(),
      live: new TaskListServiceLive(context, config.siteUrl),
    },
    readReceiptService: new ReadReceiptServiceLive(context, config.siteUrl),
    reclassificationService: new ReclassificationServiceLive(context, config.siteUrl),
    // CMS-006 — approval routing store; always live (CORMS-owned), no mock/live toggle.
    approvalTaskService: new ApprovalTaskServiceLive(context, config.siteUrl),
    // CMS-007 — signing dashboard store; always live (CORMS-owned).
    signingService: new SigningServiceLive(context, config.siteUrl),
    // CMS-007 e-signature slice — live reads Power Automate flow URLs from Admin Config; mock
    // for demos/tests. Resolved by the app data-source toggle like the other mock/live services.
    eSignatureService: {
      mock: new ESignatureServiceMock(),
      live: new ESignatureServiceLive(devSettingsLive),
    },
    bulkActionsService: new BulkActionsServiceLive(context, config.siteUrl),
    correspondenceServiceFactory: (numberingService: INumberingService) =>
      new CorrespondenceServiceLive(context, config.siteUrl, numberingService),
    attachmentService: new AttachmentServiceLive(context, config.siteUrl),
    attachmentStorageService: new AttachmentStorageServiceLive(context, config.siteUrl),
    physicalAttachmentService: new PhysicalAttachmentServiceLive(context, config.siteUrl),
    orgHierarchy: {
      mock: new OrgHierarchyServiceMock(),
      live: orgHierarchyLive,
    },
    delegation: {
      mock: new DelegationServiceMock(),
      live: new DelegationServiceLive(context, config.siteUrl, auditTrailLive),
    },
    subordinateInbox: {
      mock: new SubordinateInboxServiceMock(),
      live: new SubordinateInboxServiceLive(context, config.siteUrl, orgHierarchyLive),
    },
    reassignment: {
      mock: new ReassignmentServiceMock(),
      live: new ReassignmentServiceLive(context, config.siteUrl, orgHierarchyLive, auditTrailLive),
    },
    routing: {
      mock: new RoutingServiceMock(),
      live: new RoutingServiceLive(context, config.siteUrl, auditTrailLive),
    },
    classification: {
      mock: new ClassificationServiceMock(),
      live: new ClassificationServiceLive(context, config.siteUrl, auditTrailLive),
    },
  };
}

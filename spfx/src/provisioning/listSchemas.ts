import { DEFAULT_DATA_SOURCE_CONFIG, FEATURE_KEYS } from '../services/dataSource/dataSourceConfig';
import { DEFAULT_COURIERS } from '../models/ICourierConfig';
import {
  RETIRED_SIGNATURE_CONFIG_KEYS,
  SIGNATURE_FLOW_CONFIG_KEYS,
  SIGNATURE_PROVIDER_CONFIG_KEYS,
} from '../services/esignature/signatureFlowConfig';

/**
 * Sprint 1 SharePoint list provisioning — schema-as-data source of truth.
 *
 * Every list CORMS needs on this site is declared here as a plain ListSchema object (Part 2 of
 * the Sprint 1 provisioning task). ProvisioningService (src/services/provisioning/ProvisioningService.ts)
 * reads this array and idempotently ensures each list/field/seed-row exists — nothing here
 * executes provisioning itself. Adding a Sprint 2/3 list is a data change to SCHEMAS, not a
 * rewrite of the provisioning logic.
 *
 * RecordsHub-owned reference data (metadata, numbering, external orgs, security tiers, org
 * hierarchy, ...) is deliberately NOT declared here — CORMS never provisions a list for data it
 * doesn't own. Those are represented only as ds.* toggle/list-name rows seeded into
 * CORMS_AdminConfig below (see buildAdminConfigSeedRows), matching the existing per-feature
 * mock/live registry in src/services/dataSource/dataSourceConfig.ts.
 */

export type FieldType = 'Text' | 'Note' | 'DateTime' | 'Choice' | 'Boolean' | 'Number' | 'User';

export interface FieldSchema {
  name: string;
  type: FieldType;
  choices?: string[];
  required?: boolean;
  indexed?: boolean;
  /** Enables a SharePoint Person/Group field to hold more than one selected user. */
  allowMultiple?: boolean;
  /** Applied via a field update after ensuring the field exists (create or no-op) — never
   * overwrites an existing field's current default, only sets it the first time the field is
   * created. Booleans are written as '1'/'0', everything else as a plain string, matching how
   * SharePoint stores DefaultValue on the field's schema regardless of field type. */
  defaultValue?: string | number | boolean;
}

export type SeedRow = Record<string, string | number | boolean>;

export interface ListSchema {
  title: string;
  description: string;
  /** SP.List BaseTemplate value. 100 = Generic/Custom List (the default for every list here),
   * 101 = Document Library (CORMS_Attachments, for storing uploaded file content — not just
   * metadata about it). */
  template?: number;
  fields: FieldSchema[];
  /** Seed rows are matched by `seedMatchOn` (default 'Title') and only inserted when absent —
   * an existing row's values are never touched on re-run, even if edited since. */
  seedRows?: SeedRow[];
  seedMatchOn?: string;
  /** `seedMatchOn` values of rows an earlier release seeded and nothing reads any more. Provisioning
   * moves any it finds to the site recycle bin, so re-running it cleans up an upgraded site. */
  retiredSeedRows?: string[];
  /**
   * Optional hook resolving the list's actual title at provision time instead of using `title`
   * literally. Only CORMS_Tasks uses this, to honor the pre-existing CORMS_AdminConfig
   * "Task-List" config key (Part 2 of the task) rather than hard-coding a list name — if Power
   * Apps' team already created a list under a different name, ProvisioningService must use that
   * name instead of creating a duplicate. Schemas with a resolveTitle hook depend on
   * CORMS_AdminConfig already being provisioned — SCHEMAS below orders CORMS_AdminConfig first.
   */
  resolveTitle?: (deps: {
    readAdminConfigValue: (key: string) => Promise<string | undefined>;
  }) => Promise<string>;
}

const GENERIC_LIST_TEMPLATE = 100;
const DOCUMENT_LIBRARY_TEMPLATE = 101;

/**
 * CORMS_AdminConfig seed rows: the General/Integration keys from Part 2 of the task, plus one
 * feature-mode + one list-name row per DataSource key in FEATURE_REGISTRY (dataSourceConfig.ts) —
 * generated from that registry, not hand-duplicated, so it can never drift from the panel that
 * actually reads/writes these rows (DataSourcesPanel.tsx via devSettingsMapping.ts's
 * `feature.<key>` / `listName.<key>` naming). ds.orgHierarchy is included automatically since it
 * was added to FEATURE_REGISTRY as part of this same task.
 */
function buildAdminConfigSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [
    // General
    {
      Title: 'RootSiteUrl',
      Value: '',
      Description: "CORMS app's own root site URL.",
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'Task-List',
      Value: 'CORMS_Tasks',
      Description:
        'SharePoint list name backing My Tasks (CMS-049/050/052). Read, never overwritten, by CORMS_Tasks provisioning.',
      Category: 'General',
      IsSecret: false,
    },
    // Integration
    {
      Title: 'Dynamsoft_License_Key',
      Value: '',
      Description:
        'Dynamsoft Document Scanner JS SDK license key (CMS-002). Empty until the team ' +
        'provisions a real license — the Scan Document control renders a disabled/' +
        '"not configured" state while empty rather than failing.',
      Category: 'Integration',
      IsSecret: true,
    },
    // CMS-007 e-signature. SPFx only calls the flow URL; the flow reads the provider rows below at
    // runtime, so provider connection details are edited here rather than inside the flow.
    {
      Title: SIGNATURE_FLOW_CONFIG_KEYS.flowUrl,
      Value: '',
      Description:
        'Power Automate HTTP-trigger URL of the signing flow. CORMS sends CreateSigningRequest and ' +
        'GetSigningStatus requests to it; the flow handles all communication with the signing provider.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: SIGNATURE_PROVIDER_CONFIG_KEYS.baseUrl,
      Value: '',
      Description: 'Signing-provider API base URL, without a trailing slash. Read by the signing flow.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: SIGNATURE_PROVIDER_CONFIG_KEYS.clientCredentials,
      Value: '',
      Description:
        'Signing-provider application credentials: Base64 of clientId:clientSecret, sent as the Basic ' +
        'authorization when the signing flow requests an access token.',
      Category: 'Integration',
      IsSecret: true,
    },
    {
      Title: SIGNATURE_PROVIDER_CONFIG_KEYS.username,
      Value: '',
      Description: 'Signing-provider service account username (email). Read by the signing flow.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: SIGNATURE_PROVIDER_CONFIG_KEYS.password,
      Value: '',
      Description: 'Signing-provider service account password. Read by the signing flow.',
      Category: 'Integration',
      IsSecret: true,
    },
    // DataSource — master switch + RecordsHub site URL (same keys devSettingsMapping.ts reads/writes)
    {
      Title: 'master',
      Value: DEFAULT_DATA_SOURCE_CONFIG.master,
      Description: 'Master mock/live switch: mock | live | per-feature.',
      Category: 'DataSource',
      IsSecret: false,
    },
    // Not a ds.* RecordsHub feature toggle — CORMS owns CORMS_Correspondence outright. This one
    // key controls whether My Correspondence / Inbox-Sent render the earlier UI task's bundled
    // mock dataset or real CORMS_Correspondence rows (see src/services/appDataSource). Kept out of
    // FEATURE_REGISTRY/DataSourceConfig deliberately so it isn't reset by the ds.* panel's Reset
    // button and doesn't misrepresent CORMS-owned data as a RecordsHub dependency in that panel's
    // Consumed By/Dependency/Transport columns.
    {
      Title: 'app.correspondenceDataSource',
      Value: 'mock',
      Description:
        'mock | live — whether My Correspondence and Inbox/Sent read the bundled demo dataset ' +
        'or real CORMS_Correspondence rows. Defaults to mock for safe rollout; flip explicitly ' +
        'once the team is ready.',
      Category: 'DataSource',
      IsSecret: false,
    },
    {
      Title: 'recordsHubSiteUrl',
      Value: DEFAULT_DATA_SOURCE_CONFIG.recordsHubSiteUrl,
      Description: 'RecordsHub site URL used by live per-feature data sources.',
      Category: 'General',
      IsSecret: false,
    },
    // Task Inbox Backend task (CMS-049/050/052 Part 0) — same "app-owned, not a ds.* feature"
    // reasoning as app.correspondenceDataSource above: whether My Tasks renders the bundled demo
    // dataset or real CORMS_Tasks rows. A sibling key, not a reuse of app.correspondenceDataSource
    // — each screen's mock/live choice is independent (see taskDataSourceConfig.ts).
    {
      Title: 'app.taskDataSource',
      Value: 'mock',
      Description:
        'mock | live — whether the Task Inbox (My Tasks) reads the bundled demo dataset or real ' +
        'CORMS_Tasks rows. Defaults to mock for safe rollout; flip explicitly once the team is ready.',
      Category: 'DataSource',
      IsSecret: false,
    },
    // Delegation & Reassignment Backend task (CMS-017/018/019 Part 0/4) — same "app-owned, not a
    // ds.* feature" reasoning as app.correspondenceDataSource/app.taskDataSource above: whether
    // Delegation Management and Team Inbox render bundled demo data or real CORMS_Delegations /
    // CORMS_Correspondence rows. One toggle drives all three new services (DelegationService,
    // SubordinateInboxService, ReassignmentService) — they're one screen-pair's data, not three
    // independent surfaces.
    {
      Title: 'app.delegationDataSource',
      Value: 'mock',
      Description:
        'mock | live — whether Delegation Management and Team Inbox (incl. reassignment) read the ' +
        'bundled demo dataset or real CORMS_Delegations / CORMS_Correspondence rows. Defaults to ' +
        'mock for safe rollout; flip explicitly once the team is ready.',
      Category: 'DataSource',
      IsSecret: false,
    },
    // CMS-050/052 Part 0 — the deep-link targets for the "Create New Task" / "View Task Details"
    // SPFx entry points into Power Apps (this task's only responsibility for those two stories —
    // everything else described in their ACs is Power Apps' own screen). Empty by default until
    // the team has real URLs; the buttons handle an empty value as a disabled state, never a
    // broken navigation (see powerAppsUrls.ts). These key *names* already existed as hard-coded
    // placeholders on the static ConfigService from the earlier UI-only My Tasks task — reused
    // here, not redefined, per this task's own instruction.
    {
      Title: 'powerAppsTaskFormUrl',
      Value:
        'https://apps.powerapps.com/play/e/default-ca6eb29c-124b-490a-ad27-08fd43267e29/a/89d30dd5-2425-4c96-8046-3a8ab59a6b3a?tenantId=ca6eb29c-124b-490a-ad27-08fd43267e29&hidenavbar=true',
      Description:
        'Power Apps task-creation form URL (CMS-050) — embedded in an iframe when the user clicks ' +
        '"Create New Task". Keep hidenavbar=true so the embedded form has no Power Apps chrome. ' +
        'Empty renders the button disabled.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'powerAppsTaskDetailUrl',
      Value:
        'https://apps.powerapps.com/play/e/default-ca6eb29c-124b-490a-ad27-08fd43267e29/a/89d30dd5-2425-4c96-8046-3a8ab59a6b3a?tenantId=ca6eb29c-124b-490a-ad27-08fd43267e29&hidenavbar=true&taskId={taskId}',
      Description:
        "Power Apps task-detail form URL (CMS-052), with a literal '{taskId}' placeholder substituted " +
        'with the selected task id — embedded in an iframe on "View Details". Empty renders the action disabled.',
      Category: 'Integration',
      IsSecret: false,
    },
    // Create Correspondence → RecordsHub integration. Each field's RecordsHub list is configured by
    // pasting the list's AllItems.aspx URL here, so retargeting a tenant/environment is an Admin
    // Config edit — never a code change. External orgs + content types are managed as JSON here
    // instead of a RecordsHub list. Empty by default; the live services surface a clear
    // "not configured" error until set.
    {
      Title: 'recordsHub.securityLevelsListUrl',
      Value: '',
      Description:
        'RecordsHub Security Levels list URL (paste RH_SecurityLevels AllItems.aspx). Backs the ' +
        'Create Correspondence Security Level options when ds.metadata is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.classificationsListUrl',
      Value: '',
      Description:
        'RecordsHub Classifications list URL (paste RH_Classifications AllItems.aspx). Backs the ' +
        'Record Classification field when ds.metadata is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.orgSecurityListUrl',
      Value: '',
      Description:
        'RecordsHub Org Security list URL (paste RH_OrgSecurity AllItems.aspx). Backs the ' +
        'Destination Departments field when ds.metadata is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.numberingListUrl',
      Value: '',
      Description:
        'RecordsHub numbering list URL (paste RH_RMNumberings AllItems.aspx). Used with ' +
        'recordsHub.numberingRecordId to generate + increment correspondence numbers when ds.numbering is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.numberingRecordId',
      Value: 'CORMS',
      Description:
        'Fallback Title/Id of the RH_RMNumberings record used when the per-direction keys below are ' +
        'blank (single-series tenants). Prefer the Title so it survives the item Id changing across ' +
        'environments. Set its Pattern to e.g. OQ8-{Function}-{ContentType}-{YY}-{Digit}.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.numberingRecordId.incoming',
      Value: 'CORMS_Incoming',
      Description:
        'CMS AC8 — Title (recommended) or Id of the RH_RMNumberings record for the INCOMING numbering ' +
        'series. Separate from Outgoing so the two directions never share a serial. Blank falls back ' +
        'to recordsHub.numberingRecordId.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.numberingRecordId.outgoing',
      Value: 'CORMS_Outgoing',
      Description:
        'CMS AC8 — Title (recommended) or Id of the RH_RMNumberings record for the OUTGOING numbering ' +
        'series. Separate from Incoming so the two directions never share a serial. Blank falls back ' +
        'to recordsHub.numberingRecordId.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.externalOrganizationsJson',
      Value: '',
      Description:
        'External organizations as JSON (not from RecordsHub). Array of ' +
        '{ "nameEn": "...", "nameAr": "...", "emails": ["..."] }. Backs the External Organizations picker when ds.externalOrgs is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.contentTypesJson',
      Value: '',
      Description:
        'Correspondence Content Types as JSON (not from RecordsHub). Array of { "id": "...", "name": "..." } ' +
        '(or plain strings). Backs the Content Type field when ds.metadata is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.correspondenceTypesJson',
      Value:
        '[{"id":"Outgoing","nameEn":"Outgoing","nameAr":"صادر"},{"id":"Incoming","nameEn":"Incoming","nameAr":"وارد"}]',
      Description:
        'Correspondence Type options as JSON. Array of { "id": "...", "nameEn": "...", "nameAr": "..." }. ' +
        "id must stay 'Outgoing' or 'Incoming' (drives numbering direction/validation); nameEn/nameAr are the " +
        'bilingual labels. Backs the Correspondence Type field when ds.metadata is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.docViewerUrl',
      Value: '',
      Description:
        'Full GroupDocs document-viewer endpoint URL (e.g. https://host:9220/api/Groupdoc/viewdoc). ' +
        'Backs the Correspondence Detail → Preview tab: CORMS POSTs the document URL and renders the ' +
        'returned per-page images. Empty until configured — the Preview tab falls back to the built-in viewer.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'general.translationsCacheHours',
      Value: '168',
      Description:
        'How many hours the app caches the admin-managed translation JSON in each browser before ' +
        're-fetching it. Default 168 (one week). Lower it to make label changes propagate sooner.',
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'pendingResponse.escalationDays',
      Value: '3',
      Description:
        'CMS-014 AC4 — how many days a “pending response” flag may stay open before it is escalated. ' +
        'A pending flag whose PendingResponseFlaggedAt is older than this shows as escalation-due in ' +
        'sent/supervisor views, and a scheduled Power Automate flow sends the escalation notification. ' +
        'Default 3.',
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'security.classifiedCaptureThreshold',
      Value: '4',
      Description:
        'CMS-034 AC5 — the security tier (1=Unclassified..5=Top Secret) at or above which capturing ' +
        'classified correspondence is restricted to vetted users (Document Control / Security Officer / ' +
        'Supervisor / Manager / Administrator). A non-vetted user cannot select a level at/above this ' +
        'tier and Send is blocked for one. Default 4 (Secret); lower it to widen the vetted-only band.',
      Category: 'General',
      IsSecret: false,
    },
    // CMS-016 — notification & escalation cadences held as config (never hardcoded, read via REST,
    // changeable without a redeploy — AC3). CORMS computes/derives deadlines and escalation state
    // from these; the actual EMAIL SEND (routing notification AC1, escalation-to-user+supervisor AC2)
    // is performed by scheduled Power Automate flows that read these same keys plus the item's
    // deadline, ExpeditedFlag, and the recipient's supervisor (CORMS_UserRoles.ManagerUser).
    {
      Title: 'sla.responseDeadlineDays',
      Value: '5',
      Description:
        'CMS-016 AC4/AC5 — default number of days added to an item at classification (CMS-010) to ' +
        'derive its response deadline when the triaging officer does not set one explicitly. Task/ ' +
        'deadline end dates are computed dynamically as (current date + this many days). Default 5.',
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'escalation.reminderCadenceDays',
      Value: '2',
      Description:
        'CMS-016 AC2 — how many days before a response deadline an item is treated as “approaching” ' +
        'so the escalation notification (to the recipient and their supervisor) is due. Default 2.',
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'escalation.expeditedDays',
      Value: '1',
      Description:
        'CMS-015 AC4 / CMS-016 — the SHORTENED “approaching” window (days before deadline) applied to ' +
        'EXPEDITED items, so expedited correspondence escalates sooner than the normal cadence above. ' +
        'Default 1; must be <= escalation.reminderCadenceDays to actually accelerate.',
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'notification.routingEmailEnabled',
      Value: 'true',
      Description:
        'CMS-016 AC1 — master switch for the routing email notification the Power Automate flow sends ' +
        'when correspondence is routed to a user (email is the only channel in scope). Per-user/role ' +
        'opt-out is honored by the flow; this is the tenant-wide default. Default true.',
      Category: 'General',
      IsSecret: false,
    },
    {
      Title: 'integration.elasticEndpoint',
      Value: '',
      Description:
        'Elasticsearch base URL (e.g. https://host:9200) that the Search screen calls DIRECTLY from ' +
        'SharePoint — no .NET layer. Mirrors the RecordsHub Configurations ElasticSearchEndPoint value. ' +
        'Empty disables live Elastic search (the field falls back to the mock/no results).',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.elasticApiKey',
      Value: '',
      Description:
        'Elasticsearch API key sent as "Authorization: ApiKey <value>". Mirrors the RecordsHub ' +
        'Configurations ElasticAPIKey value. Marked secret, but note it is still delivered to the ' +
        'browser since the call is made directly from SharePoint.',
      Category: 'Integration',
      IsSecret: true,
    },
    {
      Title: 'integration.elasticAuditIndex',
      Value: 'sslaudit',
      Description:
        'Append-only Elasticsearch index used for every CORMS audit write and audit-trail read. ' +
        'Defaults to the RecordsHub-compatible sslaudit index and is deliberately separate from ' +
        'integration.elasticIndex, which scopes correspondence/task content search.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.auditingEnabled',
      Value: 'true',
      Description:
        'Master on/off switch for all CORMS auditing. When "true" (default) every audit event is ' +
        'written to the Elasticsearch audit index; set to "false" to disable auditing entirely — ' +
        'nothing is recorded to Elasticsearch or SharePoint. Existing history stays readable.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.elasticIndex',
      Value: '',
      Description:
        'Optional explicit Elasticsearch index to search. Leave BLANK (recommended): CORMS then ' +
        'auto-resolves its own per-site content index from the sharepoint_sites registry by site ' +
        'URL (e.g. ssloman.sharepoint.com_<siteGuid>_<webGuid>). Set a value only to force a ' +
        'specific index and bypass that lookup.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.elasticSitesIndex',
      Value: 'sharepoint_sites',
      Description:
        'RecordsHub site-registry index (one document per synced SharePoint site) used to resolve ' +
        'CORMS’s per-site content index by site URL when integration.elasticIndex is blank. ' +
        'Defaults to sharepoint_sites; change only if the RecordsHub connector names it differently.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.elasticCorrespondenceList',
      Value: 'CORMS_Correspondence',
      Description:
        'SharePoint list name used to keep only correspondence in search results — a RecordsHub ' +
        'per-site index holds items from many lists (RH_Links, libraries, …), each tagged with ' +
        'parentReference.list.name. Blank disables the filter (search the whole index).',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.elasticTaskList',
      Value: 'CORMS_Tasks',
      Description:
        'SharePoint list name used to keep only tasks in the Search screen’s Tasks results — the ' +
        'Tasks search type queries the same per-site index, filtered to this list by ' +
        'parentReference.list.name. Requires CORMS_Tasks to be in the RecordsHub sync scope. Blank ' +
        'disables the filter.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'integration.powerBiReportUrl',
      Value:
        'https://app.powerbi.com/view?r=eyJrIjoiYTQ5ODU5YmEtODgyNi00NDAwLWFmNGMtMWJlMTM0NDI0ZTBhIiwidCI6ImNhNmViMjljLTEyNGItNDkwYS1hZDI3LTA4ZmQ0MzI2N2UyOSIsImMiOjl9',
      Description:
        'Power BI "publish to web" embed URL backing the Statistics dashboard (the src of the ' +
        'published report iframe). Republishing the report mints a new ?r= token — update this value ' +
        'then. Empty falls back to the report bundled in code.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'recordsHub.recordsHubRegistryListUrl',
      Value: 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/Lists/RH_RecordsHub/AllItems.aspx',
      Description:
        'Create Correspondence → Attach Existing Document: browser URL of the RecordsHub RH_RecordsHub ' +
        'registry list. The picker reads RH_SiteName and RH_SiteURL from this list and excludes the ' +
        'current CORMS site. Change this URL when the RecordsHub registry moves.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.channelsJson',
      Value:
        '[{"id":"Email","nameEn":"Email","nameAr":"بريد إلكتروني"},' +
        '{"id":"Scan","nameEn":"Scan","nameAr":"مسح ضوئي"},' +
        '{"id":"Fax","nameEn":"Fax","nameAr":"فاكس"}]',
      Description:
        'Channel options for the Create Correspondence "Channel" field (how a correspondence was ' +
        'received), as JSON. Array of { "id": "...", "nameEn": "...", "nameAr": "..." }. id is the ' +
        'value saved on the correspondence (CORMS_Correspondence.Channel); nameEn/nameAr are the ' +
        'bilingual labels. Edit anytime — no code change needed.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.approvalWorkflowsJson',
      Value:
        '{"workflows":[{"id":"standard","name":"Standard Approval","steps":[]},' +
        '{"id":"board","name":"Board-Level Approval","steps":[]},' +
        '{"id":"fast-track","name":"Fast Track","steps":[]}]}',
      Description:
        'Predefined approval workflows for Create Correspondence, as JSON. Administrators manage ' +
        'the reviewer, department, group, signing, and step-order definitions from Approval Workflows.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.originatingFunctionsJson',
      Value:
        '[{"id":"fn-1","nameEn":"Executive Affairs","nameAr":"الشؤون التنفيذية"},' +
        '{"id":"fn-2","nameEn":"Operations Management","nameAr":"إدارة العمليات"},' +
        '{"id":"fn-3","nameEn":"Financial Control","nameAr":"الرقابة المالية"},' +
        '{"id":"fn-4","nameEn":"Legal Affairs","nameAr":"الشؤون القانونية"},' +
        '{"id":"fn-5","nameEn":"Human Resources","nameAr":"الموارد البشرية"},' +
        '{"id":"fn-6","nameEn":"Information Technology","nameAr":"تقنية المعلومات"}]',
      Description:
        'Originating Function options as JSON (not from RecordsHub). Array of ' +
        '{ "id": "...", "nameEn": "...", "nameAr": "..." }. Backs the Originating Function field when ds.metadata is live.',
      Category: 'Integration',
      IsSecret: false,
    },
    {
      Title: 'admin.couriersJson',
      Value: JSON.stringify(DEFAULT_COURIERS),
      Description:
        'Couriers for the Physical Mail (Courier / Express) dispatch step, as JSON. Array of ' +
        '{ "id", "name", "description", "refPrefix", "enabled", "fields":[{ "key","label","type":"select|text","required","options":[...],"placeholder" }] }. ' +
        'Set "enabled": false to hide a courier; edit fields/options to change what is captured — no code change needed. Empty falls back to the built-in list.',
      Category: 'Integration',
      IsSecret: false,
    },
  ];

  FEATURE_KEYS.forEach((key) => {
    rows.push({
      Title: `feature.${key}`,
      Value: 'mock',
      Description: `Mock/live mode for ${key}.`,
      Category: 'DataSource',
      IsSecret: false,
    });
    rows.push({
      Title: `listName.${key}`,
      Value: '',
      Description: `RecordsHub list name for ${key} (used once its toggle is set to live).`,
      Category: 'DataSource',
      IsSecret: false,
    });
  });

  return rows;
}

/** Admin Config rows earlier releases seeded that nothing reads any more. Provision Lists moves them
 * to the site recycle bin so upgraded sites show only live settings on the Admin Config screen. */
const RETIRED_ADMIN_CONFIG_KEYS: string[] = [
  'RH_SecurityPermission',
  'SendMail',
  'RH_RecordsHub_API_Key',
  'RH_SecurityLevels_API_Key',
  'GroupDocs_Preview_License_Key',
].concat(RETIRED_SIGNATURE_CONFIG_KEYS);

export const CORMS_ADMIN_CONFIG_SCHEMA: ListSchema = {
  title: 'CORMS_AdminConfig',
  description: 'Key/value admin config and the RecordsHub mock/live data-source toggle registry.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text', indexed: true },
    // Multi-line so config values can exceed the 255-char single-line-text cap — the RecordsHub
    // integration stores JSON blobs (external orgs, content types) and full list URLs here.
    { name: 'Value', type: 'Note' },
    { name: 'Description', type: 'Note' },
    { name: 'Category', type: 'Choice', choices: ['General', 'DataSource', 'Integration'] },
    { name: 'IsSecret', type: 'Boolean', defaultValue: false },
  ],
  seedRows: buildAdminConfigSeedRows(),
  seedMatchOn: 'Title',
  retiredSeedRows: RETIRED_ADMIN_CONFIG_KEYS,
};

export const CORMS_AUDIT_LOG_SCHEMA: ListSchema = {
  title: 'CORMS_AuditLog',
  description:
    'Legacy audit store retained for rollback/history only. Runtime auditing now uses the ' +
    'Elasticsearch index configured by integration.elasticAuditIndex.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'ObjectId', type: 'Text', indexed: true },
    { name: 'Actor', type: 'User' },
    { name: 'Action', type: 'Text' },
    { name: 'Details', type: 'Note' },
    {
      name: 'Category',
      type: 'Choice',
      choices: ['CorrespondenceActions', 'SystemConfig', 'AccessSecurity'],
    },
    { name: 'ChainStatus', type: 'Choice', choices: ['Valid', 'Broken'], defaultValue: 'Valid' },
  ],
};

export const CORMS_TIMELINE_SCHEMA: ListSchema = {
  title: 'CORMS_Timeline',
  description: "Correspondence lifecycle events backing CMS-040's Timeline tab.",
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    {
      name: 'EventType',
      type: 'Choice',
      choices: [
        'Created',
        'Edited',
        'Submitted',
        'ReferenceAssigned',
        'Routed',
        'Approved',
        'Rejected',
        'SignatureRequested',
        'Signed',
        'EmailSent',
        'Delivered',
        'Acknowledged',
        'Escalated',
        'Expedited',
        'Reassigned',
        // CMS-042 — a follow-up reminder scheduled on the item, and the same reminder firing on its
        // due date (the latter written by the scheduled Power Automate flow that sends the email).
        'ReminderSet',
        'ReminderFired',
      ],
    },
    { name: 'Actor', type: 'User' },
    { name: 'Description', type: 'Note' },
    { name: 'EventTimestamp', type: 'DateTime' },
  ],
};

export const CORMS_CORRESPONDENCE_SCHEMA: ListSchema = {
  title: 'CORMS_Correspondence',
  description: 'The main correspondence record (CMS-001/002/003/004/043).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text' },
    { name: 'ReferenceNo', type: 'Text', indexed: true },
    { name: 'Direction', type: 'Choice', choices: ['Incoming', 'Outgoing'] },
    { name: 'CorrespondenceType', type: 'Text' },
    { name: 'Priority', type: 'Text' },
    // Named ContentTypeName, not ContentType: SharePoint reserves "ContentType" as a built-in
    // navigation property on every list item (the item's SP.ContentType object). A custom field
    // literally named ContentType still provisions "successfully" but SharePoint stores it under
    // a different internal name to avoid the collision — so a write payload keyed "ContentType"
    // resolves against the *system* property instead, and SharePoint REST rejects it with
    // "A 'PrimitiveValue' node ... was found when trying to read the value of a navigation
    // property" (found via manual testing against a real tenant — Save Draft failed on every
    // save, subject-only included, since the key is present regardless of value).
    { name: 'ContentTypeName', type: 'Text' },
    // How the correspondence was received (Email / Scan / Fax) — the Channel DDL's chosen option
    // id. A plain Text column (not Choice) because the options are admin-managed JSON
    // (admin.channelsJson) editable without re-provisioning; additive-only, like the fields below.
    { name: 'Channel', type: 'Text' },
    { name: 'OriginatingFunction', type: 'Text' },
    {
      name: 'SecurityLevel',
      type: 'Choice',
      choices: ['Public/Unclassified', 'Restricted', 'Confidential', 'Secret', 'Top Secret'],
    },
    { name: 'RecordClassification', type: 'Text' },
    { name: 'DestinationType', type: 'Choice', choices: ['Internal', 'External'] },
    { name: 'DestinationDepartments', type: 'Note' },
    { name: 'ExternalOrganizations', type: 'Note' },
    { name: 'Sender', type: 'User' },
    { name: 'Recipient', type: 'Text' },
    { name: 'AssignedTo', type: 'User' },
    { name: 'DateCreated', type: 'DateTime' },
    { name: 'DueDate', type: 'DateTime' },
    { name: 'DeliveryEmail', type: 'Boolean', defaultValue: true },
    { name: 'DeliveryPhysicalMail', type: 'Boolean', defaultValue: false },
    // Physical-mail dispatch details as JSON (method + method-specific fields + comment), captured
    // by the Create Correspondence Physical Mail wizard (CMS-020).
    { name: 'PhysicalDispatch', type: 'Note' },
    { name: 'CommentsNotes', type: 'Note' },
    {
      name: 'Status',
      type: 'Choice',
      choices: [
        'Draft',
        'Registered',
        'In Review',
        'Approved',
        'Rejected',
        'Signed',
        'Declared',
        'Delivered',
      ],
    },
    { name: 'ThreadId', type: 'Text', indexed: true },
    { name: 'ParentReplyToId', type: 'Text' },
    // CMS-014/CMS-022 — pending-response flag; a linked reply clears it on the parent (CMS-022 AC7).
    { name: 'PendingResponse', type: 'Boolean', defaultValue: false },
    // CMS-014 — the awaited party and when/who flagged it. PendingResponseFlaggedAt drives the
    // escalation deadline (AC4): a Power Automate flow escalates a flag still set past
    // flaggedAt + pendingResponse.escalationDays (CORMS_AdminConfig). Cleared with the flag.
    { name: 'PendingResponseParty', type: 'Text' },
    { name: 'PendingResponsePartyType', type: 'Choice', choices: ['Internal', 'External'] },
    { name: 'PendingResponseFlaggedAt', type: 'DateTime' },
    { name: 'PendingResponseFlaggedBy', type: 'Text' },
    // CMS-042 — the single active follow-up reminder held on the sent item itself (edited/cleared
    // in place). A scheduled Power Automate flow triggers off ReminderDate to email the originator
    // (and, when ReminderType is 'Escalation Notice', the supervisor per CMS-016) and writes the
    // 'ReminderFired' CORMS_Timeline row. Cleared by blanking ReminderDate.
    { name: 'ReminderDate', type: 'DateTime' },
    { name: 'ReminderType', type: 'Text' },
    { name: 'ReminderNote', type: 'Note' },
    { name: 'MainDocumentFlag', type: 'Boolean' },
    // Existing-document selections are links to Records Hub source files, never copies in
    // CORMS_Attachments. Additive/idempotent provisioning keeps existing tenants safe.
    { name: 'ExistingDocumentUrl', type: 'Note' },
    { name: 'ExistingDocumentName', type: 'Text' },
    // Epic 1 workspace-shell-backend task (CMS-057 AC4/5) — deliberately deferred in Sprint 1,
    // added now as additive-only fields via the same idempotent ensureField step; no existing
    // field/data is touched.
    { name: 'ExpeditedFlag', type: 'Boolean', defaultValue: false },
    { name: 'ExpeditedReason', type: 'Note' },
    { name: 'ExpeditedBy', type: 'User' },
    { name: 'ExpeditedAt', type: 'DateTime' },
    // View Correspondence Detail backend task (CMS-040 AC6) — the Details tab needs somewhere to
    // read these from now, but populating them is owned by other, not-yet-backended epics: Triage &
    // Routing (CurrentDepartment) and the Approval Workflow (CurrentReviewer, CMS-006). Added here as
    // additive-only fields via the same idempotent ensureField step; left empty until those epics'
    // own backend tasks populate them. Do not backfill fake values — the Details tab renders '—'.
    { name: 'CurrentDepartment', type: 'Text' },
    { name: 'CurrentReviewer', type: 'User' },
    // CMS-008 — manual declaration (Declare Record): who declared it, when, and the record serial
    // number stamped for filing/retrieval. Status 'Declared' is already a choice above.
    { name: 'DeclaredBy', type: 'Text' },
    { name: 'DeclaredAt', type: 'DateTime' },
    { name: 'RecordSerialNumber', type: 'Text', indexed: true },
    // CMS-011 — Route Incoming Correspondence: the next action the triaging officer routed the
    // item with (AC3), the routing attribution (AC6), and the full recipient set as JSON (AC4,
    // since AssignedTo/CurrentDepartment only capture one primary recipient each).
    { name: 'NextAction', type: 'Text' },
    { name: 'RoutedBy', type: 'Text' },
    { name: 'RoutedAt', type: 'DateTime' },
    { name: 'RoutedRecipients', type: 'Note' },
    // CMS-024 — annotation persistence. RecordsHub/GroupDocs does NOT store annotations (it never
    // saves an annotated copy of the document): the Annotate tab creates them via /api/Annotation/add,
    // reads the canonical result back via /api/Annotation/get, and CORMS persists that JSON here so
    // they can be re-loaded and re-drawn over the plain preview whenever the document is viewed again.
    // Stored as a JSON envelope ({ v, annotations:[...] }) in the tenant's fixed render-DPI pixel
    // space (see annotationStore.ts). Additive-only via the same idempotent ensureField step.
    { name: 'AnnotationsJson', type: 'Note' },
    // CMS-037 — the approved template an OUTGOING item's body was authored from (TemplateReference,
    // the template's id) and the template version in force at authoring time (TemplateVersion, AC4).
    // Stamped at creation (buildCorrespondenceRowForWrite) as optional provenance. Incoming items
    // never carry these. Additive-only via the same idempotent ensureField step; empty on
    // pre-existing rows.
    { name: 'TemplateReference', type: 'Text' },
    { name: 'TemplateVersion', type: 'Number' },
    // The requestor marked the uploaded Outgoing main document as already signed, so Send filed it
    // as 'Signed' with no approval chain, and only its requestor-managed approvals stay closed.
    { name: 'MainDocumentSigned', type: 'Boolean', defaultValue: false },
  ],
};

export const CORMS_ATTACHMENTS_SCHEMA: ListSchema = {
  title: 'CORMS_Attachments',
  description: 'Correspondence and task attachments (CMS-001/002/050).',
  // A Document Library (not a Generic List) — "Uploaded" attachments are actual file content,
  // not just metadata about a file, so they need real document storage (versioning, content
  // types), unlike CORMS_PhysicalAttachments below (a paper item's shelf location, never a file).
  template: DOCUMENT_LIBRARY_TEMPLATE,
  fields: [
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    // Power Apps uses this task reference (for example TSK-2026-0033) to associate a document
    // with CORMS_Tasks. Index it so My Tasks can resolve card attachment indicators in one query.
    { name: 'TaskReference', type: 'Text', indexed: true },
    { name: 'FileName', type: 'Text' },
    { name: 'IsMainLetter', type: 'Boolean' },
    { name: 'Source', type: 'Choice', choices: ['Uploaded', 'RecordHubReference', 'Scanned'] },
    { name: 'RecordHubReferenceNumber', type: 'Text' },
    // Canonical URL for a supporting document selected through Attach from RecordsHub. The legacy
    // reference-number field remains for older metadata-search references.
    { name: 'RecordHubReferenceUrl', type: 'Note' },
    // CMS-034 AC6/AC7 — each attachment's own security classification tier (1=Unclassified..5=Top
    // Secret), stored independently of the parent correspondence. Defaults to (inherits) the
    // parent's classification at capture, but the capturer may override it up or down per attachment.
    { name: 'SecurityTier', type: 'Number' },
    // CMS-002 quality gate (Scan Documents backend task) — populated only for Source: 'Scanned'.
    { name: 'ScannedDPI', type: 'Number' },
    { name: 'IsQualityOverridden', type: 'Boolean', defaultValue: false },
    { name: 'QualityOverrideReason', type: 'Note' },
    { name: 'QualityOverriddenBy', type: 'User' },
    { name: 'QualityOverriddenAt', type: 'DateTime' },
  ],
};

export const CORMS_PHYSICAL_ATTACHMENTS_SCHEMA: ListSchema = {
  title: 'CORMS_PhysicalAttachments',
  description: 'Physical (non-digital) attachment references (CMS-003).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    { name: 'ResourceIdentifier', type: 'Text', indexed: true },
    { name: 'StorageLocation', type: 'Text' },
    { name: 'Description', type: 'Note' },
  ],
};

export const CORMS_DELEGATIONS_SCHEMA: ListSchema = {
  title: 'CORMS_Delegations',
  description: 'Delegation & reassignment records (CMS-017/018/019).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Delegator', type: 'User' },
    { name: 'Delegate', type: 'User' },
    { name: 'Reason', type: 'Note' },
    { name: 'StartDate', type: 'DateTime' },
    { name: 'EndDate', type: 'DateTime' },
    // DECISION: CMS-017 AC1/AC2 are authoritative over the earlier Figma prototype's
    // Pending/Accept/Reject affordance — that UI needs a follow-up reconciliation task to remove
    // the Accept/Reject actions. DelegationServiceCore.create() always writes Status: 'Active'
    // immediately (no approval step) for both self-service and admin-created delegations.
    // Pending/Rejected remain valid choices (harmless, avoids a field-type migration) but the
    // creation path never produces them; Revoked is reachable only via the explicit Revoke action.
    { name: 'Status', type: 'Choice', choices: ['Active', 'Pending', 'Rejected', 'Revoked'] },
    { name: 'CreatedBy', type: 'User' },
  ],
};

export const CORMS_DELEGATION_ATTACHMENTS_SCHEMA: ListSchema = {
  title: 'CORMS_DelegationAttachments',
  description:
    'File attachments on a delegation request (CMS-017 AC5/AC7). A dedicated list rather than a ' +
    'reuse of CORMS_Attachments — delegation attachments have their own accepted-type validation ' +
    'rule the correspondence attachment flow does not share, and it keeps AC7\'s "full ledger of ' +
    'each delegation and its attachments" a clean join rather than an overloaded field. ' +
    // DECISION: a Document Library (not a Generic List), same "real uploaded file content, not
    // just metadata about a file" reasoning as CORMS_ATTACHMENTS_SCHEMA — see that schema's own
    // template comment. Custom columns below (FileName/FileType/UploadedBy/UploadedAt) mirror
    // CORMS_Attachments' pattern of redundant-but-queryable metadata columns alongside the
    // library's own Name/system columns. A pre-existing CORMS_DelegationAttachments Generic List
    // from an earlier provisioning run must be deleted manually before re-running — SharePoint has
    // no in-place list-to-library template migration, and ProvisioningCore's idempotent
    // ensure-list step only creates what's missing, it never converts an existing list's template.
    'Provisioned as a Document Library — a real file library, not a metadata-only list. ' +
    "DelegationServiceCore.create() uploads the real file content via SharePoint's file API " +
    '(the library rejects a plain items.add() — "use SPFileCollection.Add()") and then sets this ' +
    "row's metadata columns on the resulting item.",
  template: DOCUMENT_LIBRARY_TEMPLATE,
  fields: [
    { name: 'DelegationId', type: 'Text', indexed: true },
    { name: 'FileName', type: 'Text' },
    { name: 'FileType', type: 'Choice', choices: ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG'] },
    { name: 'UploadedBy', type: 'User' },
    { name: 'UploadedAt', type: 'DateTime' },
  ],
};

export const CORMS_DELIVERY_TRACKING_SCHEMA: ListSchema = {
  title: 'CORMS_DeliveryTracking',
  description: 'Delivery & acknowledgement tracking (CMS-020/021).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    { name: 'Channel', type: 'Choice', choices: ['Email', 'PhysicalMail'] },
    { name: 'RecipientName', type: 'Text' },
    { name: 'DispatchMethod', type: 'Choice', choices: ['Courier', 'InPerson', 'Postal'] },
    { name: 'TrackingDetails', type: 'Text' },
    { name: 'Status', type: 'Choice', choices: ['Sent', 'Delivered', 'Failed'] },
    { name: 'AckActor', type: 'User' },
    { name: 'AckTimestamp', type: 'DateTime' },
  ],
};

export const CORMS_CUSTOM_FOLDERS_SCHEMA: ListSchema = {
  title: 'CORMS_CustomFolders',
  description: 'User-defined saved-search folders (CMS-054).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'OwnerUser', type: 'User' },
    { name: 'FolderName', type: 'Text' },
    { name: 'CriteriaJSON', type: 'Note' },
    { name: 'PinnedItemIds', type: 'Note' },
  ],
};

// Epic 1 — Workspace Shell & Navigation backend task (CMS-038/039/040/044/054/057). Always-live,
// CORMS-owned — no ds.* mock/live toggle entry, unlike RecordsHub-owned reference data above.

/**
 * The 9 top-level entries from CMS-038 AC4, plus the Inbox/Sent sub-entries (CMS-039 AC1) and the
 * Administration sub-entries (CMS-038 AC12). All IsSystemEntry = true (can be hidden, not deleted).
 *
 * Two deliberate additions beyond the task's literal seed list, both flagged here rather than
 * silently decided:
 *  - `administration.dataSources` / `administration.provisionLists`: these are Sprint 1 foundation
 *    screens already shipped and reachable from nav today (src/mocks/nav.json). Switching the
 *    shell's nav source to this list without re-seeding them would silently remove two working
 *    admin screens from the menu. TODO(confirm): if a later task wants them managed differently,
 *    this seed is what to revisit.
 *  - `docControl` (present in the pre-Epic-1 mock nav) is intentionally NOT reseeded here — it
 *    belongs to CMS-011, a separate epic not yet backed by this list, and the task's own seed
 *    enumeration doesn't mention it. Its owning epic adds its own CORMS_NavigationMenu row via the
 *    Navigation Menu admin screen (Part 7) when it lands.
 *  - `delegation` was originally seeded as a single flat entry, with a note that "Team Inbox
 *    returns once CMS-017/018/019 seed it themselves." The Delegation & Reassignment Backend task
 *    (CMS-017/018/019) is that task — `delegation` is now a parent group with
 *    `delegation.management` (the existing Delegation Management screen) and `delegation.teamInbox`
 *    (Supervisor/Manager/Admin only) children, matching src/mocks/nav.json's pre-Epic-1 shape. A
 *    tenant already provisioned with the old flat `delegation` row needs it deleted (or the
 *    Provision Lists screen re-run against a fresh list) before re-seeding restructures it —
 *    seeding only inserts missing Keys (`seedMatchOn: 'Key'`), it never edits an existing row.
 */
function buildNavigationMenuSeedRows(): SeedRow[] {
  const noRoles = JSON.stringify([]);
  const adminOnly = JSON.stringify(['SystemAdministrator']);
  const supervisorOrAdmin = JSON.stringify(['SupervisorManager', 'SystemAdministrator']);
  return [
    {
      Key: 'myCorrespondence',
      TranslationKey: 'nav.myCorrespondence',
      ParentKey: '',
      IconKey: 'inbox',
      Route: '/my-correspondence',
      SortOrder: 1,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    // My Tasks groups the Power Apps task list and the Approval Tasks screen. Sites seeded with the
    // earlier flat, routed row get the same shape from NavigationServiceCore at runtime.
    {
      Key: 'myTasks',
      TranslationKey: 'nav.myTasks',
      ParentKey: '',
      IconKey: 'listChecks',
      Route: '',
      SortOrder: 2,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'myTasks.tasks',
      TranslationKey: 'nav.tasks',
      ParentKey: 'myTasks',
      IconKey: 'listChecks',
      Route: '/my-tasks',
      SortOrder: 1,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'myTasks.approvalTasks',
      TranslationKey: 'nav.approvalTasks',
      ParentKey: 'myTasks',
      IconKey: 'pen',
      Route: '/approval-tasks',
      SortOrder: 2,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'inboxSent',
      TranslationKey: 'nav.inboxSent',
      ParentKey: '',
      IconKey: 'mail',
      Route: '',
      SortOrder: 3,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'triageRouting',
      TranslationKey: 'nav.triageRouting',
      ParentKey: '',
      IconKey: 'route',
      Route: '/triage-routing',
      SortOrder: 4,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: 'triagePendingCount',
    },
    {
      Key: 'delegation',
      TranslationKey: 'nav.delegation',
      ParentKey: '',
      IconKey: 'userCog',
      Route: '',
      SortOrder: 5,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'delegation.management',
      TranslationKey: 'nav.delegationManagement',
      ParentKey: 'delegation',
      IconKey: 'userCog',
      Route: '/delegation',
      SortOrder: 1,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'delegation.teamInbox',
      TranslationKey: 'nav.teamInbox',
      ParentKey: 'delegation',
      IconKey: 'users',
      Route: '/team-inbox',
      SortOrder: 2,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: supervisorOrAdmin,
      BadgeSourceKey: '',
    },
    {
      Key: 'search',
      TranslationKey: 'nav.search',
      ParentKey: '',
      IconKey: 'search',
      Route: '/search',
      SortOrder: 6,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'statistics',
      TranslationKey: 'nav.statistics',
      ParentKey: '',
      IconKey: 'barChart',
      Route: '/statistics',
      SortOrder: 7,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    // CMS-007 — the signing dashboard.
    {
      Key: 'signingDashboard',
      TranslationKey: 'nav.signingDashboard',
      ParentKey: '',
      IconKey: 'pen',
      Route: '/signing',
      SortOrder: 8,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration',
      TranslationKey: 'nav.administration',
      ParentKey: '',
      IconKey: 'settings',
      Route: '',
      SortOrder: 9,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'auditTrail',
      TranslationKey: 'nav.auditTrail',
      ParentKey: '',
      IconKey: 'history',
      Route: '/audit-trail',
      SortOrder: 10,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: JSON.stringify(['SystemAdministrator', 'Auditor']),
      BadgeSourceKey: '',
    },

    {
      Key: 'inboxSent.inbox',
      TranslationKey: 'nav.inbox',
      ParentKey: 'inboxSent',
      IconKey: 'mailOpen',
      Route: '/inbox-sent/inbox',
      SortOrder: 1,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: 'inboxUnreadCount',
    },
    {
      Key: 'inboxSent.sent',
      TranslationKey: 'nav.sent',
      ParentKey: 'inboxSent',
      IconKey: 'send',
      Route: '/inbox-sent/sent',
      SortOrder: 2,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },
    {
      Key: 'inboxSent.drafts',
      TranslationKey: 'nav.drafts',
      ParentKey: 'inboxSent',
      IconKey: 'fileEdit',
      Route: '/inbox-sent/drafts',
      SortOrder: 3,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: noRoles,
      BadgeSourceKey: '',
    },

    {
      Key: 'administration.workflowMatrix',
      TranslationKey: 'nav.workflowMatrix',
      ParentKey: 'administration',
      IconKey: 'workflow',
      Route: '/administration/workflow-matrix',
      SortOrder: 1,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.adminConfig',
      TranslationKey: 'nav.adminConfig',
      ParentKey: 'administration',
      IconKey: 'sliders',
      Route: '/administration/admin-config',
      SortOrder: 2,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.approvalWorkflows',
      TranslationKey: 'nav.approvalWorkflows',
      ParentKey: 'administration',
      IconKey: 'workflow',
      Route: '/administration/approval-workflows',
      SortOrder: 3,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.translations',
      TranslationKey: 'nav.translations',
      ParentKey: 'administration',
      IconKey: 'languages',
      Route: '/administration/translations',
      SortOrder: 4,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.navigationMenu',
      TranslationKey: 'nav.navigationMenu',
      ParentKey: 'administration',
      IconKey: 'list',
      Route: '/administration/navigation-menu',
      SortOrder: 5,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.dataSources',
      TranslationKey: 'nav.dataSources',
      ParentKey: 'administration',
      IconKey: 'database',
      Route: '/administration/data-sources',
      SortOrder: 6,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.provisionLists',
      TranslationKey: 'nav.provisionLists',
      ParentKey: 'administration',
      IconKey: 'listChecks',
      Route: '/administration/provision-lists',
      SortOrder: 7,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    {
      Key: 'administration.reclassifications',
      TranslationKey: 'nav.reclassifications',
      ParentKey: 'administration',
      IconKey: 'shieldCheck',
      Route: '/administration/reclassifications',
      SortOrder: 8,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    // CMS-005 AC13 — the SSL Oman correspondence-template author/edit screen.
    {
      Key: 'administration.templates',
      TranslationKey: 'nav.templates',
      ParentKey: 'administration',
      IconKey: 'fileText',
      Route: '/administration/templates',
      SortOrder: 9,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
    // CMS-055 AC3 — per-user permission (views/tabs/buttons/dashboards) configuration screen.
    {
      Key: 'administration.userPermissions',
      TranslationKey: 'nav.userPermissions',
      ParentKey: 'administration',
      IconKey: 'userCog',
      Route: '/administration/user-permissions',
      SortOrder: 10,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: adminOnly,
      BadgeSourceKey: '',
    },
  ];
}

export const CORMS_USER_ROLES_SCHEMA: ListSchema = {
  title: 'CORMS_UserRoles',
  description:
    'CORMS role assignment per user — backs role-gated navigation (CMS-038 AC6), clearance/role ' +
    'enforcement across this epic, and the nav footer role label (CMS-038 AC8). ManagerUser (reporting ' +
    'line) is populated now so CMS-018/019 (later epics) do not need a second migration.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'User', type: 'User', indexed: true },
    {
      name: 'Role',
      type: 'Choice',
      choices: [
        'Originator',
        'Reviewer',
        'Recipient',
        'DocumentControl',
        'CEOTriageOfficer',
        'SupervisorManager',
        'SystemAdministrator',
        'Auditor',
      ],
    },
    { name: 'Department', type: 'Text' },
    { name: 'ManagerUser', type: 'User' },
    // DECISION (Delegation & Reassignment Backend, CMS-019 AC1/AC2): reassignment must resolve an
    // arbitrary toUserId's clearance tier, not just the caller's own (the only thing
    // IRecordsHubService.getCurrentUser().clearanceTier can resolve). ds.securityTiers — the
    // "real" future source — is registered but unimplemented and owned by a different ticket
    // (CMS-034/CMS-023). Added here additively, mirroring the ManagerUser precedent above: a field
    // pre-provisioned so a later ticket (the real ds.securityTiers work) doesn't need a second
    // migration. Unset defaults to DEFAULT_CLEARANCE_TIER (1) — see src/services/common/clearance.ts.
    { name: 'ClearanceTier', type: 'Number' },
    // CMS-055 AC3 (= CMS-036 AC3): per-user permission configuration — a JSON object controlling
    // which views/tabs/buttons/dashboards this user can see, e.g.
    // {"views":{"statistics":false},"buttons":{...}}. Note (multi-line) since it is a serialized
    // object, same as CORMS_NavigationMenu.RequiredRoles below. Additive and DEFAULT-ALLOW: blank
    // on every pre-existing row and blank hides nothing (see resolvePermissions.ts), so it needs no
    // backfill. Edited per user on the Administration → User Permissions screen; the signed-in
    // user's value is resolved by RoleServiceCore and enforced for navigation by NavigationServiceCore.
    { name: 'PermissionsJson', type: 'Note' },
  ],
};

export const CORMS_NAVIGATION_MENU_SCHEMA: ListSchema = {
  title: 'CORMS_NavigationMenu',
  description:
    'Left-navigation structure and per-role visibility (CMS-038). Structure/visibility only — labels ' +
    'are never stored here, TranslationKey looks them up in the existing Translations JSON (CMS-056).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Key', type: 'Text', indexed: true, required: true },
    { name: 'TranslationKey', type: 'Text' },
    { name: 'ParentKey', type: 'Text' },
    { name: 'IconKey', type: 'Text' },
    { name: 'Route', type: 'Text' },
    { name: 'SortOrder', type: 'Number' },
    { name: 'IsVisible', type: 'Boolean', defaultValue: true },
    { name: 'IsSystemEntry', type: 'Boolean', defaultValue: false },
    // JSON array of CORMS_UserRoles.Role values (Note, not Choice — it's a serialized array).
    { name: 'RequiredRoles', type: 'Note' },
    { name: 'BadgeSourceKey', type: 'Text' },
  ],
  seedRows: buildNavigationMenuSeedRows(),
  seedMatchOn: 'Key',
};

export const CORMS_READ_RECEIPTS_SCHEMA: ListSchema = {
  title: 'CORMS_ReadReceipts',
  description:
    'Backs the Inbox "Unread" quick filter and CMS-057 bulk Mark Read/Unread. A dedicated list ' +
    '(CorrespondenceId, UserId) rather than a field on CORMS_Correspondence — SharePoint REST filtering ' +
    'on multi-value person fields is unreliable; two indexed scalar columns filter cleanly and scale ' +
    'for bulk operations. An item is unread for a user when no matching row exists.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    { name: 'UserId', type: 'Number', indexed: true },
    { name: 'ReadAt', type: 'DateTime' },
  ],
};

export const CORMS_TASKS_SCHEMA: ListSchema = {
  title: 'CORMS_Tasks',
  description: 'My Tasks list shared with Power Apps (CMS-049/050/052).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text' },
    { name: 'TaskType', type: 'Choice', choices: ['To Do', 'Follow-up Task', 'Reminder'] },
    { name: 'Priority', type: 'Choice', choices: ['Low', 'Normal', 'High'] },
    { name: 'Status', type: 'Choice', choices: ['Pending', 'In Progress', 'Overdue', 'Completed'] },
    { name: 'DueDate', type: 'DateTime' },
    { name: 'AssignedToTeam', type: 'Text' },
    { name: 'AssignedToUser', type: 'User', allowMultiple: true },
    { name: 'RelatedCorrespondenceId', type: 'Text' },
    { name: 'Description', type: 'Note' },
    { name: 'ReferenceNo', type: 'Text' },
  ],
  // Honor the pre-existing CORMS_AdminConfig "Task-List" key instead of hard-coding a name
  // (Part 2 of the task) — read, never write: CORMS_AdminConfig's own seed row already
  // guarantees this key exists with a 'CORMS_Tasks' default by the time this hook runs, since
  // CORMS_AdminConfig is provisioned first (see SCHEMAS order below).
  resolveTitle: async ({ readAdminConfigValue }) => {
    const configured = await readAdminConfigValue('Task-List');
    return configured && configured.trim().length > 0 ? configured.trim() : 'CORMS_Tasks';
  },
};

export const CORMS_RECLASSIFICATION_REQUESTS_SCHEMA: ListSchema = {
  title: 'CORMS_ReclassificationRequests',
  description:
    'CMS-023 maker-checker re-classification requests. A non-admin raising a security-level change ' +
    'creates a Pending row here; a checker approves (applies the change) or rejects it. Records ' +
    'only the SECURITY LEVEL change — never the file-plan classification (AC4).',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text' },
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    { name: 'CorrespondenceRef', type: 'Text' },
    { name: 'Subject', type: 'Text' },
    { name: 'FromTier', type: 'Number' },
    { name: 'ToTier', type: 'Number' },
    { name: 'FromLevel', type: 'Text' },
    { name: 'ToLevel', type: 'Text' },
    { name: 'Justification', type: 'Note' },
    { name: 'RequestedBy', type: 'Text' },
    { name: 'RequestedAt', type: 'DateTime' },
    { name: 'Status', type: 'Choice', choices: ['Pending', 'Approved', 'Rejected'] },
    { name: 'DecidedBy', type: 'Text' },
    { name: 'DecidedAt', type: 'DateTime' },
    { name: 'DecisionNote', type: 'Note' },
  ],
};

export const CORMS_APPROVAL_TASKS_SCHEMA: ListSchema = {
  title: 'CORMS_ApprovalTasks',
  description:
    'CMS-006 approval routing. One row per participant of a routed draft (Reviewer → 1, Group → one ' +
    'per member, Department → one team task). The row is the single source of truth for that ' +
    "participant's approval status; reviewers Approve/Reject/Return from the correspondence detail " +
    'screen. Assignees are held as plain text (claims key + display name), not a People field.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text' },
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    { name: 'ReferenceNo', type: 'Text' },
    { name: 'StepOrder', type: 'Number' },
    { name: 'StepType', type: 'Choice', choices: ['Reviewer', 'Department', 'Group'] },
    { name: 'StepName', type: 'Text' },
    { name: 'ApprovalMode', type: 'Choice', choices: ['Any', 'All'] },
    { name: 'AssignedToId', type: 'Text' },
    { name: 'AssignedToName', type: 'Text' },
    { name: 'AssignedToTeam', type: 'Text' },
    // CMS-048 — ascending seniority rank of a Department member (1 signs first); empty for others.
    { name: 'Seniority', type: 'Number' },
    { name: 'RequireSignature', type: 'Boolean', defaultValue: false },
    { name: 'SignaturePlacement', type: 'Note' },
    // An external signing request and separately flow-verified completion that unlocks approval.
    { name: 'SignatureExternalDocumentId', type: 'Text' },
    { name: 'SignatureRequestedAt', type: 'DateTime' },
    { name: 'SignatureRequestedBy', type: 'Text' },
    { name: 'SignatureCompletedAt', type: 'DateTime' },
    { name: 'SignatureCompletedBy', type: 'Text' },
    { name: 'Status', type: 'Choice', choices: ['Pending', 'Approved', 'Rejected', 'Returned', 'Cancelled'] },
    { name: 'DecisionComment', type: 'Note' },
    { name: 'DecidedBy', type: 'Text' },
    { name: 'DecidedAt', type: 'DateTime' },
  ],
};

export const CORMS_SIGNING_SESSIONS_SCHEMA: ListSchema = {
  title: 'CORMS_SigningSessions',
  description:
    'CMS-007 signing dashboard. One row per digital-signature request, tracked and managed (search, ' +
    'resend, cancel, history) from the signing dashboard. Created and completed by the external ' +
    'Provider-independent Power Automate signing integration; signing history is a JSON array in EventsJson.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text' },
    { name: 'CorrespondenceId', type: 'Text', indexed: true },
    { name: 'ReferenceNo', type: 'Text', indexed: true },
    { name: 'Subject', type: 'Text' },
    { name: 'SignerName', type: 'Text' },
    { name: 'SignerEmail', type: 'Text' },
    { name: 'ExternalDocumentId', type: 'Text' },
    {
      name: 'Status',
      type: 'Choice',
      choices: ['Sent', 'Viewed', 'Signed', 'Declined', 'Cancelled', 'Expired'],
    },
    { name: 'SentAt', type: 'DateTime' },
    { name: 'SignedAt', type: 'DateTime' },
    { name: 'EventsJson', type: 'Note' },
  ],
};

export const CORMS_WORKFLOW_MATRIX_SCHEMA: ListSchema = {
  title: 'CORMS_WorkflowMatrix',
  description:
    'CMS-012 rule-based Routing Matrix. One row per rule: match conditions (Type / Direction / ' +
    'Priority / Security Level / Function / source Department) and the destination (a department, ' +
    'individual, or role group) with its pipeline flow. Read by Triage & Routing (default route) ' +
    'and the Workflow Matrix admin screen; the matrix-wide first-match/all-match setting lives in ' +
    'CORMS_AdminConfig (routing.matchMode), not here.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    // Title holds the human rule name (the "Rule" column).
    { name: 'Title', type: 'Text' },
    { name: 'RuleType', type: 'Text' },
    { name: 'Direction', type: 'Text' },
    { name: 'Priority', type: 'Text' },
    { name: 'SecurityLevel', type: 'Text' },
    { name: 'FunctionCondition', type: 'Text' },
    { name: 'DepartmentCondition', type: 'Text' },
    {
      name: 'TargetKind',
      type: 'Choice',
      choices: ['department', 'individual', 'role'],
      defaultValue: 'department',
    },
    { name: 'TargetValue', type: 'Text' },
    { name: 'Flow', type: 'Note' },
    { name: 'Approver', type: 'Text' },
    { name: 'RuleNote', type: 'Note' },
    { name: 'SortOrder', type: 'Number' },
  ],
};

export const CORMS_TEMPLATES_SCHEMA: ListSchema = {
  title: 'CORMS_Templates',
  description:
    'CMS-005/037 correspondence templates authored/approved by SSL Oman. One row per template: the ' +
    'letterhead Header/Footer and the authorable BodyHtml (all carrying wildcard placeholders), an ' +
    'Approved flag (only approved templates are offered to originators), and a Version bumped on each ' +
    'save (stamped onto an outgoing item at authoring time). Read/written by TemplatesService on ' +
    "CORMS's own site and edited from the Administration → Templates screen.",
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    // Title holds the template name.
    { name: 'Title', type: 'Text' },
    { name: 'Header', type: 'Note' },
    { name: 'Footer', type: 'Note' },
    { name: 'BodyHtml', type: 'Note' },
    { name: 'Approved', type: 'Boolean', defaultValue: true },
    // TemplateVersion, NOT Version: "Version" is a reserved SharePoint column, so a custom field
    // named Version provisions under a mangled internal name and every write keyed "Version" 400s
    // ("property 'Version' does not exist") — same collision as ContentType -> ContentTypeName above.
    { name: 'TemplateVersion', type: 'Number', defaultValue: 1 },
  ],
  // Three ready-to-use templates for testing (inserted only when absent, matched by Title). Bodies
  // use the wildcard placeholders the compose interpolation understands ({{referenceNumber}},
  // {{date}}, {{recipient}}, {{subject}}, {{sender}}, {{role}}).
  seedRows: [
    {
      Title: 'Official Letter',
      Header: 'Sultan Special Local (SSL) Oman\nRef: {{referenceNumber}}          Date: {{date}}',
      Footer: 'SSL Oman · P.O. Box 000, Muscat, Sultanate of Oman · www.ssloman.om',
      BodyHtml:
        '<p>To: {{recipient}}</p><p>Subject: <strong>{{subject}}</strong></p>' +
        '<p>Dear Sir/Madam,</p><p>[Body of the letter goes here.]</p>' +
        '<p>We look forward to your kind cooperation.</p>',
      Approved: true,
      TemplateVersion: 1,
    },
    {
      Title: 'Internal Memo',
      Header: 'INTERNAL MEMORANDUM\nRef: {{referenceNumber}}          Date: {{date}}',
      Footer: 'Internal use only — SSL Oman',
      BodyHtml:
        '<p>To: {{recipient}}</p><p>From: {{sender}} ({{role}})</p>' +
        '<p>Subject: <strong>{{subject}}</strong></p><p>[Memo content goes here.]</p>',
      Approved: true,
      TemplateVersion: 1,
    },
    {
      Title: 'Meeting Invitation',
      Header: 'SSL Oman — Meeting Invitation\nRef: {{referenceNumber}}          Date: {{date}}',
      Footer: 'Please confirm your attendance.',
      BodyHtml:
        '<p>Dear {{recipient}},</p><p>You are invited to a meeting regarding ' +
        '<strong>{{subject}}</strong>.</p><p>Date/Time: [__]<br/>Location: [__]</p>' +
        '<p>Regards,<br/>{{sender}}</p>',
      Approved: true,
      TemplateVersion: 1,
    },
  ],
};

export const CORMS_NUMBERING_STATE_SCHEMA: ListSchema = {
  title: 'CORMS_NumberingState',
  description:
    'CMS AC9 — CORMS-owned per-series numbering state. One row per numbering series ' +
    '(Title = "<recordId>::<direction>") holding LastYear, the calendar year the RH_RMNumberings ' +
    'counter currently belongs to. When the current year differs, NumberingService resets that ' +
    "series' serial to the first number of the new year. RH_RMNumberings carries no year column, so " +
    'this lives on CORMS.',
  template: GENERIC_LIST_TEMPLATE,
  fields: [
    { name: 'Title', type: 'Text', indexed: true },
    { name: 'LastYear', type: 'Number' },
  ],
};

/**
 * Provisioning order: CORMS_AdminConfig must run first because CORMS_Tasks.resolveTitle reads
 * its "Task-List" key. Every other list is independent of ordering.
 */
export const SCHEMAS: ListSchema[] = [
  CORMS_ADMIN_CONFIG_SCHEMA,
  // CORMS_AuditLog is intentionally no longer provisioned. Existing lists are left untouched for
  // rollback and a future explicit backfill; all runtime audit reads/writes use Elasticsearch.
  CORMS_TIMELINE_SCHEMA,
  CORMS_CORRESPONDENCE_SCHEMA,
  CORMS_ATTACHMENTS_SCHEMA,
  CORMS_PHYSICAL_ATTACHMENTS_SCHEMA,
  CORMS_DELEGATIONS_SCHEMA,
  CORMS_DELEGATION_ATTACHMENTS_SCHEMA,
  CORMS_DELIVERY_TRACKING_SCHEMA,
  CORMS_CUSTOM_FOLDERS_SCHEMA,
  CORMS_TASKS_SCHEMA,
  // Epic 1 — Workspace Shell & Navigation backend task.
  CORMS_USER_ROLES_SCHEMA,
  CORMS_NAVIGATION_MENU_SCHEMA,
  CORMS_READ_RECEIPTS_SCHEMA,
  CORMS_RECLASSIFICATION_REQUESTS_SCHEMA,
  // CMS-006 — approval routing tasks.
  CORMS_APPROVAL_TASKS_SCHEMA,
  // CMS-007 — signing dashboard sessions.
  CORMS_SIGNING_SESSIONS_SCHEMA,
  // CMS-012 — rule-based routing matrix.
  CORMS_WORKFLOW_MATRIX_SCHEMA,
  // CMS-005/037 — correspondence templates (was missing from provisioning).
  CORMS_TEMPLATES_SCHEMA,
  // CMS AC9 — per-series numbering year state (per-year serial reset).
  CORMS_NUMBERING_STATE_SCHEMA,
];

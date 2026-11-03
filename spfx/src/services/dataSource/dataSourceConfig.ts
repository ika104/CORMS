export type DataSourceMode = 'mock' | 'live';
export type MasterMode = DataSourceMode | 'per-feature';
export type Transport = 'sp-rest' | 'elastic';

export type FeatureKey =
  | 'ds.menu' // nav / menu naming        (CMS-038)   D-01,D-08  [SP REST]
  | 'ds.metadata' // type/direction/priority/security/departments (CMS-001/010/034) D-02 [SP REST]
  | 'ds.numbering' // numbering list+mechanism  (CMS-004)   D-03       [SP REST]
  | 'ds.externalOrgs' // external organizations    (CMS-043)   D-04       [SP REST]
  | 'ds.securityTiers' // tiers + record classifications (CMS-034/023) D-02 [SP REST]
  | 'ds.config' // Configuration List        (CMS-016/036/055/056) D-11 [SP REST]
  | 'ds.audit' // audit trail               (CMS-045)   D-06       [Elasticsearch]
  | 'ds.search' // Elastic query-builder     (CMS-025/026) D-05     [Elasticsearch, NOT SP REST]
  | 'ds.templates' // document templates (Compose > Use Template) (CMS-005) D-TBD [SP REST]
  | 'ds.orgHierarchy'; // reporting-line/subordinate lookups (CMS-018/019) D-TBD [SP REST]

export interface IFeatureMeta {
  key: FeatureKey;
  labelKey: string;
  consumedBy: string[];
  dependencyRef: string;
  transport: Transport;
  /** False when no live service exists yet — the toggle/list-name are still shown but Test reports "not implemented". */
  implemented: boolean;
  /** Audit integrity must not be disabled by the generic demo-data switch. */
  lockedMode?: DataSourceMode;
  /** False when the feature uses dedicated integration config instead of a SharePoint list name. */
  acceptsListName?: boolean;
}

// Features without a live implementation remain registered so the Admin panel and persistence
// shape are ready. ds.audit is intentionally always wired to its live append-only service by
// bootstrap: audit integrity cannot depend on a presentation/demo toggle.
export const FEATURE_REGISTRY: Record<FeatureKey, IFeatureMeta> = {
  'ds.menu': {
    key: 'ds.menu',
    labelKey: 'dataSource.feature.menu',
    consumedBy: ['CMS-038'],
    dependencyRef: 'D-01, D-08',
    transport: 'sp-rest',
    implemented: true,
  },
  'ds.metadata': {
    key: 'ds.metadata',
    labelKey: 'dataSource.feature.metadata',
    consumedBy: ['CMS-001', 'CMS-010', 'CMS-034'],
    dependencyRef: 'D-02',
    transport: 'sp-rest',
    implemented: false,
  },
  'ds.numbering': {
    key: 'ds.numbering',
    labelKey: 'dataSource.feature.numbering',
    consumedBy: ['CMS-004'],
    dependencyRef: 'D-03',
    transport: 'sp-rest',
    implemented: false,
  },
  'ds.externalOrgs': {
    key: 'ds.externalOrgs',
    labelKey: 'dataSource.feature.externalOrgs',
    consumedBy: ['CMS-043'],
    dependencyRef: 'D-04',
    transport: 'sp-rest',
    implemented: false,
  },
  'ds.securityTiers': {
    key: 'ds.securityTiers',
    labelKey: 'dataSource.feature.securityTiers',
    consumedBy: ['CMS-034', 'CMS-023'],
    dependencyRef: 'D-02',
    transport: 'sp-rest',
    implemented: false,
  },
  'ds.config': {
    key: 'ds.config',
    labelKey: 'dataSource.feature.config',
    consumedBy: ['CMS-016', 'CMS-036', 'CMS-055', 'CMS-056'],
    dependencyRef: 'D-11',
    transport: 'sp-rest',
    implemented: false,
  },
  'ds.audit': {
    key: 'ds.audit',
    labelKey: 'dataSource.feature.audit',
    consumedBy: ['CMS-045'],
    dependencyRef: 'D-06',
    transport: 'elastic',
    implemented: true,
    lockedMode: 'live',
    acceptsListName: false,
  },
  'ds.search': {
    key: 'ds.search',
    labelKey: 'dataSource.feature.search',
    consumedBy: ['CMS-025', 'CMS-026'],
    dependencyRef: 'D-05',
    transport: 'elastic',
    implemented: true,
  },
  // TODO(confirm): TASK-05 §8 item 2 — added so Compose > Use Template resolves through the
  // TASK-03 toggle like every other RecordsHub-backed field; D-ref pending until confirmed.
  'ds.templates': {
    key: 'ds.templates',
    labelKey: 'dataSource.feature.templates',
    consumedBy: ['CMS-005'],
    dependencyRef: 'D-TBD',
    transport: 'sp-rest',
    implemented: false,
  },
  // Delegation & Reassignment Backend task (CMS-017/018/019) — reporting-line/subordinate lookups
  // backing the Team Inbox subordinate view and reassignment. Live implementation
  // (OrgHierarchyServiceLive) reads CORMS_UserRoles.ManagerUser, pre-provisioned by Sprint 1
  // specifically for this ("populated now so CMS-018/019 do not need a second migration").
  'ds.orgHierarchy': {
    key: 'ds.orgHierarchy',
    labelKey: 'dataSource.feature.orgHierarchy',
    consumedBy: ['CMS-018', 'CMS-019'],
    dependencyRef: 'D-TBD',
    transport: 'sp-rest',
    implemented: true,
  },
};

export const FEATURE_KEYS: FeatureKey[] = Object.keys(FEATURE_REGISTRY) as FeatureKey[];

export interface DataSourceConfig {
  master: MasterMode;
  features: Record<FeatureKey, DataSourceMode>;
  recordsHubSiteUrl: string;
  listNames: Partial<Record<FeatureKey, string>>;
}

// TODO(confirm): master defaults to 'per-feature' with every feature on 'mock' (spec §9 item 3).
export const DEFAULT_DATA_SOURCE_CONFIG: DataSourceConfig = {
  master: 'per-feature',
  features: FEATURE_KEYS.reduce(
    (acc, key) => {
      acc[key] = FEATURE_REGISTRY[key].lockedMode ?? 'mock';
      return acc;
    },
    {} as Record<FeatureKey, DataSourceMode>
  ),
  recordsHubSiteUrl: '',
  listNames: {},
};

export function resolveMode(key: FeatureKey, config: DataSourceConfig): DataSourceMode {
  return config.master === 'per-feature' ? config.features[key] : config.master;
}

export function isDevModeActive(config: DataSourceConfig): boolean {
  return FEATURE_KEYS.some((key) => resolveMode(key, config) === 'mock');
}

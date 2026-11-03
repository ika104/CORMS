import {
  DataSourceConfig,
  DEFAULT_DATA_SOURCE_CONFIG,
  FEATURE_KEYS,
  FEATURE_REGISTRY,
  FeatureKey,
} from './dataSourceConfig';

/**
 * One row of the CORMS_AdminConfig list (Title/Value key-value shape). CORMS_AdminConfig
 * supersedes the earlier CORMS_DevSettings naming (Sprint 1 list-provisioning task) — see
 * TODO(confirm) in DevSettingsService.live.ts for the migration note. Category values match
 * CORMS_AdminConfig's Category choice field (General/DataSource/Integration), not the old
 * CORMS_DevSettings list's (DataSource/Global).
 */
export interface IDevSettingRow {
  key: string;
  value: string;
  description?: string;
  category?: 'General' | 'DataSource' | 'Integration';
}

const MASTER_KEY = 'master';
const SITE_URL_KEY = 'recordsHubSiteUrl';
const FEATURE_PREFIX = 'feature.';
const LIST_NAME_PREFIX = 'listName.';

export function configToRows(config: DataSourceConfig): IDevSettingRow[] {
  const rows: IDevSettingRow[] = [
    { key: MASTER_KEY, value: config.master, category: 'DataSource' },
    { key: SITE_URL_KEY, value: config.recordsHubSiteUrl, category: 'General' },
  ];
  FEATURE_KEYS.forEach((featureKey) => {
    const meta = FEATURE_REGISTRY[featureKey];
    rows.push({
      key: `${FEATURE_PREFIX}${featureKey}`,
      value: meta.lockedMode ?? config.features[featureKey],
      category: 'DataSource',
    });
    const listName = config.listNames[featureKey];
    if (meta.acceptsListName !== false && listName) {
      rows.push({ key: `${LIST_NAME_PREFIX}${featureKey}`, value: listName, category: 'DataSource' });
    }
  });
  return rows;
}

export function rowsToConfig(rows: IDevSettingRow[]): DataSourceConfig {
  const config: DataSourceConfig = {
    master: DEFAULT_DATA_SOURCE_CONFIG.master,
    features: { ...DEFAULT_DATA_SOURCE_CONFIG.features },
    recordsHubSiteUrl: DEFAULT_DATA_SOURCE_CONFIG.recordsHubSiteUrl,
    listNames: {},
  };

  rows.forEach((row) => {
    if (
      row.key === MASTER_KEY &&
      (row.value === 'mock' || row.value === 'live' || row.value === 'per-feature')
    ) {
      config.master = row.value;
      return;
    }
    if (row.key === SITE_URL_KEY) {
      config.recordsHubSiteUrl = row.value;
      return;
    }
    if (row.key.indexOf(FEATURE_PREFIX) === 0) {
      const featureKey = row.key.slice(FEATURE_PREFIX.length) as FeatureKey;
      if (featureKey in config.features && (row.value === 'mock' || row.value === 'live')) {
        config.features[featureKey] = row.value;
      }
      return;
    }
    if (row.key.indexOf(LIST_NAME_PREFIX) === 0) {
      const featureKey = row.key.slice(LIST_NAME_PREFIX.length) as FeatureKey;
      if (featureKey in config.features) {
        config.listNames[featureKey] = row.value;
      }
    }
  });

  // Auditing is append-only operational data, not a demo-data source. Older tenants may still
  // carry the placeholder feature.ds.audit=mock row from before the ES implementation existed;
  // normalize it to the registry's locked live mode when reading.
  FEATURE_KEYS.forEach((featureKey) => {
    const lockedMode = FEATURE_REGISTRY[featureKey].lockedMode;
    if (lockedMode) config.features[featureKey] = lockedMode;
  });

  return config;
}

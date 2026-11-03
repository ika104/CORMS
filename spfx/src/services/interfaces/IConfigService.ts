export interface IAppConfig {
  /** DEV site URL — TODO(confirm): pending from Zeyad; set here only, never hard-coded elsewhere. */
  siteUrl: string;
  /** RecordsHub site URL — TODO(confirm): pending from Zeyad, like siteUrl (TASK-03 §9 item 1). */
  recordsHubSiteUrl: string;
  /** TODO(confirm): Elasticsearch endpoint for the ds.search live transport, once agreed. */
  elasticUrl?: string;
  /** Power Apps task-creation form (CMS-050) — TODO(confirm): pending from Zeyad, like siteUrl. */
  powerAppsTaskFormUrl: string;
  /** Power Apps task-detail screen (CMS-052) — task id is appended as a query param on open. TODO(confirm): pending from Zeyad, like siteUrl. */
  powerAppsTaskDetailUrl: string;
  environment: 'dev' | 'test' | 'prod';
  appTitle: string;
}

export interface IConfigService {
  getConfig(): IAppConfig;
}

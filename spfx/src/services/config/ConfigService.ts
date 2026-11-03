import { IAppConfig, IConfigService } from '../interfaces/IConfigService';

// RecordsHub site URL is configured per tenant in CORMS_AdminConfig (the `recordsHubSiteUrl` key on
// the Data Sources admin panel) and resolved live by RecordsHubServiceLive — NOT hardcoded here.
// This constant is only a last-resort fallback for when that Admin Config value is unset; left empty
// so no tenant-specific URL is ever baked into the shipped package.
const config: IAppConfig = {
  siteUrl: 'https://ssloman.sharepoint.com/sites/CORMS',
  recordsHubSiteUrl: '',
  powerAppsTaskFormUrl: 'https://TODO-CONFIRM.apps.powerapps.com/play/task-form',
  powerAppsTaskDetailUrl: 'https://TODO-CONFIRM.apps.powerapps.com/play/task-detail',
  environment: 'dev',
  appTitle: 'CORMS',
};

export class ConfigService implements IConfigService {
  public getConfig(): IAppConfig {
    return config;
  }
}

import { IElasticService } from '../interfaces/IElasticService';
import { IExternalOrgsService } from '../interfaces/IExternalOrgsService';
import { IMetadataService } from '../interfaces/IMetadataService';
import { INumberingService } from '../interfaces/INumberingService';
import { IOrgHierarchyService } from '../interfaces/IOrgHierarchyService';
import { IRecordsHubService } from '../interfaces/IRecordsHubService';
import { ITemplatesService } from '../interfaces/ITemplatesService';
import { DataSourceConfig, resolveMode } from './dataSourceConfig';

export { resolveMode } from './dataSourceConfig';

export function buildRecordsHubService(
  config: DataSourceConfig,
  mock: IRecordsHubService,
  live: IRecordsHubService
): IRecordsHubService {
  return resolveMode('ds.menu', config) === 'live' ? live : mock;
}

export function buildElasticService(
  config: DataSourceConfig,
  mock: IElasticService,
  live: IElasticService
): IElasticService {
  return resolveMode('ds.search', config) === 'live' ? live : mock;
}

export function buildMetadataService(
  config: DataSourceConfig,
  mock: IMetadataService,
  live: IMetadataService
): IMetadataService {
  return resolveMode('ds.metadata', config) === 'live' ? live : mock;
}

export function buildExternalOrgsService(
  config: DataSourceConfig,
  mock: IExternalOrgsService,
  live: IExternalOrgsService
): IExternalOrgsService {
  return resolveMode('ds.externalOrgs', config) === 'live' ? live : mock;
}

export function buildNumberingService(
  config: DataSourceConfig,
  mock: INumberingService,
  live: INumberingService
): INumberingService {
  return resolveMode('ds.numbering', config) === 'live' ? live : mock;
}

export function buildTemplatesService(
  config: DataSourceConfig,
  mock: ITemplatesService,
  live: ITemplatesService
): ITemplatesService {
  return resolveMode('ds.templates', config) === 'live' ? live : mock;
}

export function buildOrgHierarchyService(
  config: DataSourceConfig,
  mock: IOrgHierarchyService,
  live: IOrgHierarchyService
): IOrgHierarchyService {
  return resolveMode('ds.orgHierarchy', config) === 'live' ? live : mock;
}

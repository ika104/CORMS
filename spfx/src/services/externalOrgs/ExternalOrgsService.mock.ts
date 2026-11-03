import { IExternalOrgsService } from '../interfaces/IExternalOrgsService';
import { IExternalOrganization } from '../../models/ICorrespondenceMetadata';
import externalOrganizationsMock from '../../mocks/externalOrganizations.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

export class ExternalOrgsServiceMock implements IExternalOrgsService {
  public getExternalOrganizations(query?: string): Promise<IExternalOrganization[]> {
    const items = externalOrganizationsMock as IExternalOrganization[];
    const filtered = query ? items.filter((i) => i.name.toLowerCase().indexOf(query.toLowerCase()) !== -1) : items;
    return delay(filtered);
  }
}

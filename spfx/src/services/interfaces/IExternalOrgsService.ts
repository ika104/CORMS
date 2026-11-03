import { IExternalOrganization } from '../../models/ICorrespondenceMetadata';

// Backs ds.externalOrgs (D-04).
export interface IExternalOrgsService {
  getExternalOrganizations(query?: string): Promise<IExternalOrganization[]>;
}

import { IExternalOrgsService } from '../interfaces/IExternalOrgsService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { IExternalOrganization } from '../../models/ICorrespondenceMetadata';
import {
  parseExternalOrganizationsJson,
  readAdminConfigValues,
  RECORDS_HUB_CONFIG_KEYS,
} from '../recordsHubConfig/recordsHubConfig';

// ds.externalOrgs (D-04). Per Part 2 of the RecordsHub-integration task, external organizations
// are deliberately NOT read from RecordsHub for now — they're managed as a JSON blob in
// CORMS_AdminConfig (admin.externalOrganizationsJson: name EN/AR + optional emails), so the team
// can maintain the short list without a RecordsHub list. No SP context needed; the JSON is read
// through the same CORMS_AdminConfig client every other admin value uses.
export class ExternalOrgsServiceLive implements IExternalOrgsService {
  constructor(private readonly devSettings: IDevSettingsService) {}

  public async getExternalOrganizations(query?: string): Promise<IExternalOrganization[]> {
    const values = await readAdminConfigValues(this.devSettings);
    const all = parseExternalOrganizationsJson(values[RECORDS_HUB_CONFIG_KEYS.externalOrganizationsJson]);
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(
      (org) => org.name.toLowerCase().indexOf(q) !== -1 || (org.nameAr ?? '').toLowerCase().indexOf(q) !== -1
    );
  }
}

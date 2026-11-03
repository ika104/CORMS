import { IPersonOption } from '../../models/ICorrespondenceMetadata';

export interface ISharePointService {
  getWebTitle(): Promise<string>;
  /** Searches the site's people picker (users) for the query — backs the Create Correspondence
   * Recipient field. Returns [] on error so the field degrades gracefully rather than throwing. */
  searchPeople(query: string, maxSuggestions?: number): Promise<IPersonOption[]>;
}

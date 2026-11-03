import {
  IChannelOption,
  IContentType,
  ICorrespondenceTypeOption,
  IDestinationDepartment,
  IOriginatingFunction,
  IRecipient,
  IRecordClassification,
  IRecordHubDocument,
  ISecurityLevel,
} from '../../models/ICorrespondenceMetadata';
import { ICourierConfig } from '../../models/ICourierConfig';

// Backs ds.metadata (D-02). The live implementation now sources each Create Correspondence field
// from its own configurable place (RecordsHub RH_* lists for security levels / classifications /
// destination departments; CORMS_AdminConfig JSON for content types) rather than one shared list —
// see MetadataService.live.ts. Record classifications are filtered to active-only.
export interface IMetadataService {
  getContentTypes(query?: string): Promise<IContentType[]>;
  /** Correspondence Type options (Admin Config JSON) with EN/AR labels; ids stay Outgoing/Incoming. */
  getCorrespondenceTypes(): Promise<ICorrespondenceTypeOption[]>;
  /** Channel options (Admin Config JSON, admin.channelsJson) — Email / Scan / Fax by default — for
   * the single-select Channel DDL; the chosen id is persisted on the correspondence. */
  getChannels(): Promise<IChannelOption[]>;
  getOriginatingFunctions(): Promise<IOriginatingFunction[]>;
  getRecipients(query?: string): Promise<IRecipient[]>;
  /** Selectable security levels (RecordsHub RH_SecurityLevels), ascending by tier. */
  getSecurityLevels(query?: string): Promise<ISecurityLevel[]>;
  /** Returns active classifications only. */
  getRecordClassifications(query?: string): Promise<IRecordClassification[]>;
  getDestinationDepartments(query?: string): Promise<IDestinationDepartment[]>;
  /** Couriers for the Physical Mail dispatch step (admin.couriersJson) — enabled ones only, each
   * with its per-courier fields. */
  getCouriers(): Promise<ICourierConfig[]>;
  /** Supporting Documents > Attach from RecordHub search. TODO(confirm): dependency ref/FeatureKey
   * unspecified in TASK-05 §6 — grouped under ds.metadata's single filterable list for now. */
  searchRecordHubDocuments(query?: string): Promise<IRecordHubDocument[]>;
}

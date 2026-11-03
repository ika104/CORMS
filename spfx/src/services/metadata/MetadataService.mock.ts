import { IMetadataService } from '../interfaces/IMetadataService';
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
import { SECURITY_TIERS } from '../../models/ICorrespondence';
import { ICourierConfig, DEFAULT_COURIERS } from '../../models/ICourierConfig';
import contentTypesMock from '../../mocks/contentTypes.json';
import originatingFunctionsMock from '../../mocks/originatingFunctions.json';
import recipientsMock from '../../mocks/recipients.json';
import recordClassificationsMock from '../../mocks/recordClassifications.json';
import destinationDepartmentsMock from '../../mocks/destinationDepartments.json';
import recordHubDocumentsMock from '../../mocks/recordHubDocuments.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

function matches(name: string, query?: string): boolean {
  return !query || name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
}

export class MetadataServiceMock implements IMetadataService {
  public getContentTypes(query?: string): Promise<IContentType[]> {
    return delay((contentTypesMock as IContentType[]).filter((item) => matches(item.name, query)));
  }

  public getCorrespondenceTypes(): Promise<ICorrespondenceTypeOption[]> {
    return delay([
      { id: 'Outgoing', nameEn: 'Outgoing', nameAr: 'صادر' },
      { id: 'Incoming', nameEn: 'Incoming', nameAr: 'وارد' },
    ]);
  }

  public getChannels(): Promise<IChannelOption[]> {
    return delay([
      { id: 'Email', nameEn: 'Email', nameAr: 'بريد إلكتروني' },
      { id: 'Scan', nameEn: 'Scan', nameAr: 'مسح ضوئي' },
      { id: 'Fax', nameEn: 'Fax', nameAr: 'فاكس' },
    ]);
  }

  public getOriginatingFunctions(): Promise<IOriginatingFunction[]> {
    return delay(originatingFunctionsMock as IOriginatingFunction[]);
  }

  public getCouriers(): Promise<ICourierConfig[]> {
    return delay(DEFAULT_COURIERS);
  }

  // originatingFunctionsMock stays English-only (no nameAr) — the live service is where the
  // bilingual Admin Config JSON is read; the mock only needs to exercise the shape.

  public getRecipients(query?: string): Promise<IRecipient[]> {
    return delay((recipientsMock as IRecipient[]).filter((item) => matches(item.name, query)));
  }

  public getSecurityLevels(query?: string): Promise<ISecurityLevel[]> {
    const levels = SECURITY_TIERS.map((tier) => ({ id: String(tier.tier), name: tier.name, tier: tier.tier }));
    return delay(levels.filter((level) => matches(level.name, query)));
  }

  public getRecordClassifications(query?: string): Promise<IRecordClassification[]> {
    return delay(
      (recordClassificationsMock as IRecordClassification[]).filter(
        (item) => item.active && (matches(item.name, query) || matches(item.recordNumber, query))
      )
    );
  }

  public getDestinationDepartments(query?: string): Promise<IDestinationDepartment[]> {
    return delay((destinationDepartmentsMock as IDestinationDepartment[]).filter((item) => matches(item.name, query)));
  }

  public searchRecordHubDocuments(query?: string): Promise<IRecordHubDocument[]> {
    return delay(
      (recordHubDocumentsMock as IRecordHubDocument[]).filter(
        (item) => matches(item.name, query) || matches(item.recordNumber, query)
      )
    );
  }
}

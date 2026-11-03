import type { SPFI } from '@pnp/sp';
import { ICreatePhysicalAttachmentInput, IPhysicalAttachmentRecord } from '../../models/IPhysicalAttachmentRecord';
import { escapeODataLiteral } from '../common/odata';

const LIST_TITLE = 'CORMS_PhysicalAttachments';
const MAX_GENERATION_ATTEMPTS = 5;
const SERIAL_PAD_LENGTH = 4;

interface IPhysicalAttachmentListItem {
  Id: number;
  CorrespondenceId?: string;
  ResourceIdentifier?: string;
  StorageLocation?: string;
  Description?: string;
}

function mapRow(row: IPhysicalAttachmentListItem): IPhysicalAttachmentRecord {
  return {
    id: String(row.Id),
    correspondenceId: row.CorrespondenceId ?? '',
    resourceIdentifier: row.ResourceIdentifier ?? '',
    storageLocation: row.StorageLocation ?? '',
    description: row.Description ?? '',
  };
}

function formatIdentifier(year: number, serial: number): string {
  return `PHY-${year}-${String(serial).padStart(SERIAL_PAD_LENGTH, '0')}`;
}

/**
 * Pure CORMS_PhysicalAttachments write/read logic (CMS-003) — see provisioningCore.ts's file
 * comment for why Core classes only `import type { SPFI }`. PhysicalAttachmentService.live.ts is
 * the thin real wrapper.
 */
export class PhysicalAttachmentServiceCore {
  constructor(private readonly sp: SPFI) {}

  public async create(input: ICreatePhysicalAttachmentInput): Promise<IPhysicalAttachmentRecord> {
    const year = new Date().getUTCFullYear();
    const resourceIdentifier = await this.generateUniqueResourceIdentifier(year);
    const created = (await this.sp.web.lists.getByTitle(LIST_TITLE).items.add({
      Title: resourceIdentifier,
      CorrespondenceId: input.correspondenceId,
      ResourceIdentifier: resourceIdentifier,
      StorageLocation: input.storageLocation,
      Description: input.description,
    })) as IPhysicalAttachmentListItem;
    return mapRow(created);
  }

  public async getByCorrespondence(correspondenceId: string): Promise<IPhysicalAttachmentRecord[]> {
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`CorrespondenceId eq '${escapeODataLiteral(correspondenceId)}'`)
      .select('Id', 'CorrespondenceId', 'ResourceIdentifier', 'StorageLocation', 'Description')()) as IPhysicalAttachmentListItem[];
    return items.map(mapRow);
  }

  public async search(query: string): Promise<IPhysicalAttachmentRecord[]> {
    const term = escapeODataLiteral(query);
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`substringof('${term}',ResourceIdentifier) or substringof('${term}',StorageLocation)`)
      .select('Id', 'CorrespondenceId', 'ResourceIdentifier', 'StorageLocation', 'Description')()) as IPhysicalAttachmentListItem[];
    return items.map(mapRow);
  }

  /** Sequential-per-year, human-readable identifiers (AC's format choice over a GUID), guarded
   * against a race/gap with a check-then-insert loop rather than trusting the count-based guess
   * outright — the guess can collide (e.g. an earlier row in this year was deleted, leaving a
   * gap the naive count doesn't account for), so each candidate is verified unique before use,
   * retrying with the next serial on a collision. */
  private async generateUniqueResourceIdentifier(year: number): Promise<string> {
    let serial = await this.guessNextSerial(year);
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const candidate = formatIdentifier(year, serial);
      const taken = await this.identifierExists(candidate);
      if (!taken) return candidate;
      serial += 1;
    }
    throw new Error(`Could not generate a unique physical attachment resource identifier for ${year}.`);
  }

  private async guessNextSerial(year: number): Promise<number> {
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`substringof('PHY-${year}-',ResourceIdentifier)`)
      .select('Id')()) as IPhysicalAttachmentListItem[];
    return items.length + 1;
  }

  private async identifierExists(identifier: string): Promise<boolean> {
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`ResourceIdentifier eq '${escapeODataLiteral(identifier)}'`)
      .select('Id')()) as IPhysicalAttachmentListItem[];
    return items.length > 0;
  }
}

import type { SPFI } from '@pnp/sp';
import { AttachmentSource, ICreateAttachmentInput, IAttachmentRecord } from '../../models/IAttachmentRecord';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { escapeODataLiteral } from '../common/odata';

const LIST_TITLE = 'CORMS_Attachments';

/** CORMS_Attachments is a Document Library — SharePoint rejects a plain `items.add()` against one
 * outright ("To add an item to a document library, use SPFileCollection.Add()", found via manual
 * testing against a real tenant), so every item needs a real file behind it before its metadata
 * columns can be set. This is the narrow surface AttachmentServiceCore needs for that, mirroring
 * DelegationServiceCore's IDelegationAttachmentUploadSurface split (real PnPjs calls live only in
 * AttachmentService.live.ts, so Core stays fully unit-testable without them). */
export interface IAttachmentContentSurface {
  /** Resolves the real SharePoint list-item Id for a file already uploaded via
   * IAttachmentStorageService.uploadFile() — 'Uploaded'/'Scanned' sources always go through that
   * service first (it owns the CORMS_Attachments/{correspondenceId} folder placement), this only
   * looks up the resulting item. */
  resolveItemId(serverRelativeUrl: string): Promise<number>;
  /** 'RecordHubReference' entries have no real file of their own (they point at an external
   * RecordHub document, never a copy of it) — but a Document Library item still needs *some*
   * backing content, so this uploads a small placeholder blob instead, into the library root. */
  uploadPlaceholder(fileName: string, content: Blob): Promise<number>;
}

interface IAttachmentListItem {
  Id: number;
  CorrespondenceId?: string;
  FileName?: string;
  IsMainLetter?: boolean;
  Source?: string;
  RecordHubReferenceNumber?: string;
  RecordHubReferenceUrl?: string;
  ScannedDPI?: number;
  SecurityTier?: number;
  IsQualityOverridden?: boolean;
  QualityOverrideReason?: string;
  QualityOverriddenAt?: string;
}

// The always-present CORMS_Attachments columns — safe to $select on any provisioned tenant.
const BASE_SELECT_FIELDS = [
  'Id',
  'CorrespondenceId',
  'FileName',
  'IsMainLetter',
  'Source',
  'RecordHubReferenceNumber',
  'ScannedDPI',
  'SecurityTier',
  'IsQualityOverridden',
  'QualityOverrideReason',
  'QualityOverriddenAt',
] as const;

// Additive columns introduced after the original schema. A tenant that hasn't re-run Provision
// Lists since they were added doesn't have them yet, and naming a non-existent column in $select
// makes SharePoint 400 the WHOLE query — which for list() used to cascade into empty attachments
// and a dead Preview / Annotate tab. So they are requested best-effort and dropped on failure.
// (RecordHubReferenceUrl arrived with the RecordsHub-attachments work.)
const ADDITIVE_SELECT_FIELDS = ['RecordHubReferenceUrl'] as const;

const FULL_SELECT_FIELDS = [...BASE_SELECT_FIELDS, ...ADDITIVE_SELECT_FIELDS];

function mapRow(row: IAttachmentListItem): IAttachmentRecord {
  return {
    id: String(row.Id),
    correspondenceId: row.CorrespondenceId ?? '',
    fileName: row.FileName ?? '',
    isMainLetter: Boolean(row.IsMainLetter),
    source: (row.Source as AttachmentSource) ?? 'Uploaded',
    ...(row.RecordHubReferenceNumber ? { recordHubReferenceNumber: row.RecordHubReferenceNumber } : {}),
    ...(row.RecordHubReferenceUrl ? { recordHubReferenceUrl: row.RecordHubReferenceUrl } : {}),
    scannedDPI: row.ScannedDPI,
    securityTier: row.SecurityTier ?? undefined,
    isQualityOverridden: row.IsQualityOverridden,
    qualityOverrideReason: row.QualityOverrideReason || undefined,
    qualityOverriddenAt: row.QualityOverriddenAt || undefined,
  };
}

/**
 * Pure CORMS_Attachments *metadata* write/read logic (CMS-001 AC6/AC7, CMS-002's quality-gate
 * persistence) — see provisioningCore.ts's file comment for why Core classes only
 * `import type { SPFI }`. CORMS_Attachments is a Document Library, but this class only ever
 * touches its ordinary list-items surface (metadata columns) — actual file bytes are a separate
 * concern, see AttachmentStorageServiceCore. AttachmentService.live.ts is the thin real wrapper.
 */
export class AttachmentServiceCore {
  constructor(
    private readonly sp: SPFI,
    /** Optional — read-only consumers (e.g. CorrespondenceDetailServiceCore.getAttachments, which
     * only ever calls list()) never need one; create() throws a clear error if called without it
     * rather than silently misbehaving. */
    private readonly contentSurface?: IAttachmentContentSurface
  ) {}

  public async create(input: ICreateAttachmentInput): Promise<IAttachmentRecord> {
    if (!this.contentSurface) {
      throw new Error('AttachmentServiceCore.create: this instance was constructed without an IAttachmentContentSurface.');
    }
    const itemId =
      input.source === 'RecordHubReference'
        ? await this.contentSurface.uploadPlaceholder(
            input.fileName,
            new Blob(
              [`RecordHub reference: ${input.recordHubReferenceUrl ?? input.recordHubReferenceNumber ?? input.fileName}`],
              { type: 'text/plain' }
            )
          )
        : await this.contentSurface.resolveItemId(this.requireServerRelativeUrl(input));

    const list = this.sp.web.lists.getByTitle(LIST_TITLE);
    await list.items.getById(itemId).update({
      Title: input.fileName,
      CorrespondenceId: input.correspondenceId,
      FileName: input.fileName,
      IsMainLetter: input.isMainLetter ?? false,
      Source: input.source,
      RecordHubReferenceNumber: input.recordHubReferenceNumber ?? '',
      // RecordHubReferenceUrl is the additive column that may be absent on a not-yet-reprovisioned
      // tenant. Writing it unconditionally (even as '') 400s the whole update there and would break
      // capture, so only send it when there's an actual value — a RecordHub-reference capture that
      // needs it still requires the column (re-run Provision Lists), but an ordinary upload no
      // longer touches it.
      ...(input.recordHubReferenceUrl ? { RecordHubReferenceUrl: input.recordHubReferenceUrl } : {}),
      ScannedDPI: input.scannedDPI,
      SecurityTier: input.securityTier,
      IsQualityOverridden: input.isQualityOverridden ?? false,
      QualityOverrideReason: input.qualityOverrideReason ?? '',
    });
    const readBack = (fields: readonly string[]): Promise<IAttachmentListItem> =>
      list.items.getById(itemId).select(...fields)() as Promise<IAttachmentListItem>;
    // Same additive-column degradation as list(): on a tenant missing RecordHubReferenceUrl the
    // full select 400s, so fall back to the always-present columns.
    let created: IAttachmentListItem;
    try {
      created = await readBack(FULL_SELECT_FIELDS);
    } catch {
      created = await readBack(BASE_SELECT_FIELDS);
    }
    return mapRow(created);
  }

  private requireServerRelativeUrl(input: ICreateAttachmentInput): string {
    if (!input.serverRelativeUrl) {
      throw new Error(
        `AttachmentServiceCore.create: serverRelativeUrl is required for source "${input.source}" — upload the file via ` +
          'IAttachmentStorageService.uploadFile() first.'
      );
    }
    return input.serverRelativeUrl;
  }

  public async list(correspondenceId: string): Promise<IAttachmentRecord[]> {
    const query = (fields: readonly string[]): Promise<IAttachmentListItem[]> =>
      this.sp.web.lists
        .getByTitle(LIST_TITLE)
        .items.filter(`CorrespondenceId eq '${escapeODataLiteral(correspondenceId)}'`)
        .select(...fields)() as Promise<IAttachmentListItem[]>;
    // Try the full select first; if an additive column isn't provisioned yet (400s the whole
    // query), fall back to the always-present columns so attachments — and therefore the Preview
    // and Annotate tabs, which depend on the resolved document URL — still load. Mirrors the
    // additive-column degradation RoleServiceCore uses for PermissionsJson.
    let items: IAttachmentListItem[];
    try {
      items = await query(FULL_SELECT_FIELDS);
    } catch {
      items = await query(BASE_SELECT_FIELDS);
    }
    return items.map(mapRow);
  }

  public async setMainLetter(correspondenceId: string, attachmentId: string): Promise<void> {
    const existing = await this.list(correspondenceId);
    const list = this.sp.web.lists.getByTitle(LIST_TITLE);
    await Promise.all(
      existing
        .filter((a) => a.isMainLetter && a.id !== attachmentId)
        .map((a) => list.items.getById(Number(a.id)).update({ IsMainLetter: false }))
    );
    await list.items.getById(Number(attachmentId)).update({ IsMainLetter: true });
  }

  public async defaultMainLetterIfNone(correspondenceId: string): Promise<void> {
    const existing = await this.list(correspondenceId);
    if (existing.length === 0 || existing.some((a) => a.isMainLetter)) return;
    // "First" = lowest SharePoint item id, i.e. earliest created — no explicit ordering field.
    const first = existing.reduce((min, a) => (Number(a.id) < Number(min.id) ? a : min));
    await this.setMainLetter(correspondenceId, first.id);
  }

  public async remove(attachmentId: string): Promise<void> {
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(Number(attachmentId)).delete();
  }

  public async recordQualityOverride(attachmentId: string, reason: string): Promise<void> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.getById(Number(attachmentId))
      .update({
        IsQualityOverridden: true,
        QualityOverrideReason: reason,
        QualityOverriddenById: currentUserId,
        QualityOverriddenAt: new Date().toISOString(),
      });
  }
}

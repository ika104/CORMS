/**
 * CORMS_Attachments row shape, matching listSchemas.ts's CORMS_ATTACHMENTS_SCHEMA field-for-field
 * (plus the CMS-002 quality-gate fields added by this task's Part 0). Deliberately distinct from
 * IAttachment (src/models/ICorrespondenceDetail.ts) — that one is the Detail view's own
 * display-only shape (`source` is free text, no CorrespondenceId/quality fields) and the Detail
 * view is explicitly out of scope for this task, so it's left untouched.
 */
export type AttachmentSource = 'Uploaded' | 'RecordHubReference' | 'Scanned';

export interface IAttachmentRecord {
  id: string;
  correspondenceId: string;
  fileName: string;
  isMainLetter: boolean;
  source: AttachmentSource;
  recordHubReferenceNumber?: string;
  /** Canonical RecordsHub document URL when attached through the site/library browser. */
  recordHubReferenceUrl?: string;
  scannedDPI?: number;
  /** CMS-034 AC6/AC7 — this attachment's own security classification tier (1=Unclassified..5=Top
   * Secret, see SECURITY_TIERS), stored independently of the parent correspondence. Defaults to
   * the parent's classification (inherited at capture) but can be overridden up or down per
   * attachment. Optional so pre-CMS-034 rows without the column keep mapping. */
  securityTier?: number;
  isQualityOverridden?: boolean;
  qualityOverrideReason?: string;
  qualityOverriddenBy?: string;
  qualityOverriddenAt?: string;
}

export type ICreateAttachmentInput = Omit<IAttachmentRecord, 'id' | 'isMainLetter'> & {
  isMainLetter?: boolean;
  /** Server-relative URL of the real file already uploaded via IAttachmentStorageService
   * .uploadFile() — required for 'Uploaded'/'Scanned' sources. CORMS_Attachments is a
   * Document Library, so every item needs real backing file content; AttachmentServiceCore.create()
   * only sets that item's metadata columns, it never creates a second item via items.add() (which
   * SharePoint rejects outright for a library — "To add an item to a document library, use
   * SPFileCollection.Add()", found via manual testing against a real tenant). Not needed for
   * 'RecordHubReference', which has no real file of its own.
   */
  serverRelativeUrl?: string;
};

/** A file's location within the CORMS_Attachments document library — the binary-file counterpart
 * to IAttachmentRecord's metadata row (AttachmentStorageServiceCore, CMS-002 AC3). */
export interface IStoredFile {
  fileName: string;
  serverRelativeUrl: string;
}

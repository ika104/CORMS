/** CORMS_PhysicalAttachments row shape, matching listSchemas.ts's
 * CORMS_PHYSICAL_ATTACHMENTS_SCHEMA field-for-field (CMS-003). */
export interface IPhysicalAttachmentRecord {
  id: string;
  correspondenceId: string;
  /** Format `PHY-{year}-{4-digit-serial}` — see PhysicalAttachmentServiceCore. */
  resourceIdentifier: string;
  storageLocation: string;
  description: string;
}

export interface ICreatePhysicalAttachmentInput {
  correspondenceId: string;
  storageLocation: string;
  description: string;
}

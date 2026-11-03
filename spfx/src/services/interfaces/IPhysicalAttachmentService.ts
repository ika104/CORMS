import { ICreatePhysicalAttachmentInput, IPhysicalAttachmentRecord } from '../../models/IPhysicalAttachmentRecord';

// CORMS_PhysicalAttachments (CMS-003). Always live, no ds.* toggle — CORMS owns this data
// outright, same convention as every other Create Correspondence backend service.
export interface IPhysicalAttachmentService {
  create(input: ICreatePhysicalAttachmentInput): Promise<IPhysicalAttachmentRecord>;
  getByCorrespondence(correspondenceId: string): Promise<IPhysicalAttachmentRecord[]>;
  /** Filters by URI (ResourceIdentifier) or storage location (AC4). Full browse/search UI belongs
   * on the Detail view's Files tab — out of scope here (see SupportingDocumentsSection.tsx's
   * TODO) — this method is exposed for that minimal in-flow use only. */
  search(query: string): Promise<IPhysicalAttachmentRecord[]>;
}

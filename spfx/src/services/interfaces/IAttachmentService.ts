import { ICreateAttachmentInput, IAttachmentRecord } from '../../models/IAttachmentRecord';

// CORMS_Attachments metadata (CMS-001 AC6/AC7, CMS-002's quality-gate persistence). Always live,
// no ds.* toggle — CORMS owns this data outright, same convention as ICorrespondenceService.
export interface IAttachmentService {
  create(input: ICreateAttachmentInput): Promise<IAttachmentRecord>;
  list(correspondenceId: string): Promise<IAttachmentRecord[]>;
  setMainLetter(correspondenceId: string, attachmentId: string): Promise<void>;
  /** If no attachment for this correspondence is flagged IsMainLetter, flags the earliest one
   * created. TODO(confirm): "explicit mark as main letter" UI control not present in the current
   * screen — defaulted to first attachment; add a UI affordance if RecordsHub/OQ8 wants explicit
   * control. */
  defaultMainLetterIfNone(correspondenceId: string): Promise<void>;
  /** `overriddenBy` (QualityOverriddenBy, a People field) is always the current signed-in user —
   * resolved by the implementation itself, same reasoning as CorrespondenceServiceCore's Sender. */
  recordQualityOverride(attachmentId: string, reason: string): Promise<void>;
  /** Removes an attachment row — used when the user removes a supporting document from the
   * Create Correspondence screen after it was already persisted. */
  remove(attachmentId: string): Promise<void>;
}

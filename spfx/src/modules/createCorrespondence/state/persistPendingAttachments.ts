import { IAttachmentService } from '../../../services/interfaces/IAttachmentService';
import { IAttachmentStorageService } from '../../../services/interfaces/IAttachmentStorageService';
import { IPhysicalAttachmentService } from '../../../services/interfaces/IPhysicalAttachmentService';
import { IAttachmentRecord } from '../../../models/IAttachmentRecord';
import { buildAttachmentFolderPath } from '../../../services/attachments/attachmentFolderPath';
import { ICreateCorrespondenceFormState, IPendingFile, IPhysicalAttachment, ISupportingDocument } from './types';

export interface IPersistAttachmentsServices {
  attachmentService: IAttachmentService;
  attachmentStorageService: IAttachmentStorageService;
  physicalAttachmentService: IPhysicalAttachmentService;
}

export interface IPersistPendingAttachmentsResult {
  /** True when a pendingMainDocument was uploaded this call — the caller clears
   * state.pendingMainDocument when true (nothing to do on false: either there never was one, or an
   * earlier save this session already persisted it). */
  mainDocumentPersisted: boolean;
  /** Same array the caller should write back to state.supportingDocuments — entries already
   * persisted in an earlier save this session (attachmentId set) pass through unchanged. */
  supportingDocuments: ISupportingDocument[];
  /** Same array the caller should write back to state.physicalAttachments — entries already
   * persisted in an earlier save this session (resourceId set) pass through unchanged. */
  physicalAttachments: IPhysicalAttachment[];
}

/**
 * The post-create half of the Create Correspondence write path (CMS-001 AC6/AC7, CMS-002 AC3) —
 * uploads every picked/scanned file and creates every attachment/physical-attachment row for real,
 * now that the CORMS_Correspondence row genuinely exists. Nothing is ever uploaded or persisted
 * before this runs — ComposeDocumentSection/SupportingDocumentsSection only ever hold picked/
 * scanned content as local pending form state (pendingMainDocument / ISupportingDocument.pending
 * / IPhysicalAttachment with no resourceId yet), never touching SharePoint
 * themselves. This replaces the earlier draftSessionId-staged-then-migrated design entirely —
 * there is no interim id to reconcile and no Drafts folder to move files out of, since nothing is
 * created until the real id is known.
 *
 * Idempotent and incremental by design: safe to call after every successful
 * ICorrespondenceService.create() (both Save Draft and Send), including a second Save Draft click
 * in the same session — anything already persisted (attachmentId / resourceId set) is skipped, so
 * only genuinely new pending entries added since the last save are uploaded.
 *
 * Callers must treat a rejection here as non-fatal: the correspondence row is already committed by
 * the time this runs, so a failure must never be reported to the user as "save/send failed".
 */
export async function persistPendingAttachments(
  services: IPersistAttachmentsServices,
  state: ICreateCorrespondenceFormState,
  correspondenceId: string,
  // CMS AC11 — the DateCreated + issued reference from the create() result, used to fold files under
  // Year/Month/Serial. Omitted (or without a reference) => files go under the bare id (draft).
  folderContext?: { dateCreated?: string; referenceNumber?: string }
): Promise<IPersistPendingAttachmentsResult> {
  const { attachmentService, physicalAttachmentService } = services;

  // CMS-034 AC6/AC7 — every attachment carries its own classification, defaulting to (inheriting)
  // the parent correspondence's classification unless the capturer overrode it per attachment.
  const parentSecurityTier = state.securityTier;

  // The physical folder every file for this item is written under (AC11). Metadata rows still key
  // off correspondenceId; only the file's storage location changes.
  const storageFolder = buildAttachmentFolderPath({
    correspondenceId,
    dateCreated: folderContext?.dateCreated,
    referenceNumber: folderContext?.referenceNumber,
  });

  let mainDocumentPersisted = false;
  if (state.pendingMainDocument) {
    const { fileName, ...pending } = state.pendingMainDocument;
    await persistPendingFile(services, correspondenceId, storageFolder, fileName, pending, true, parentSecurityTier);
    mainDocumentPersisted = true;
  }

  const supportingDocuments = await Promise.all(
    state.supportingDocuments.map(async (doc): Promise<ISupportingDocument> => {
      if (doc.attachmentId) return doc; // already persisted in an earlier save this session

      // Per-attachment override (doc.securityTier / doc.pending.securityTier) wins; otherwise the
      // attachment inherits the parent correspondence's classification.
      const docSecurityTier = doc.securityTier ?? doc.pending?.securityTier ?? parentSecurityTier;

      if (doc.source === 'upload' && doc.pending) {
        const record = await persistPendingFile(services, correspondenceId, storageFolder, doc.name, doc.pending, false, docSecurityTier);
        return { ...doc, attachmentId: record.id, pending: undefined };
      }

      if (doc.source === 'recordhub-reference') {
        const record = await attachmentService.create({
          correspondenceId,
          fileName: doc.name,
          source: 'RecordHubReference',
          recordHubReferenceNumber: doc.recordNumber,
          recordHubReferenceUrl: doc.recordHubReferenceUrl,
          securityTier: docSecurityTier,
        });
        return { ...doc, attachmentId: record.id };
      }

      return doc;
    })
  );

  const physicalAttachments = await Promise.all(
    state.physicalAttachments.map(async (item): Promise<IPhysicalAttachment> => {
      if (item.resourceId) return item; // already persisted in an earlier save this session
      const record = await physicalAttachmentService.create({
        correspondenceId,
        storageLocation: item.storageLocation,
        description: item.description,
      });
      return { ...item, resourceId: record.resourceIdentifier };
    })
  );

  return { mainDocumentPersisted, supportingDocuments, physicalAttachments };
}

/** Uploads one pending file's bytes into CORMS_Attachments/{storageFolder}/ (AC11 Year/Month/Serial)
 * and creates its metadata row (keyed by correspondenceId), applying any scan-quality override the
 * user accepted at scan time. Shared by the main document and every supporting document so both
 * record the same provenance — in particular a scanned supporting document is stored as 'Scanned',
 * not 'Uploaded'. */
async function persistPendingFile(
  services: IPersistAttachmentsServices,
  correspondenceId: string,
  storageFolder: string,
  fileName: string,
  pending: IPendingFile,
  isMainLetter: boolean,
  securityTier: number | undefined
): Promise<IAttachmentRecord> {
  const stored = await services.attachmentStorageService.uploadFile(storageFolder, fileName, pending.content);
  const record = await services.attachmentService.create({
    correspondenceId,
    fileName,
    source: pending.source,
    scannedDPI: pending.scannedDPI,
    securityTier: pending.securityTier ?? securityTier,
    serverRelativeUrl: stored.serverRelativeUrl,
    isMainLetter,
  });
  if (pending.qualityOverrideReason) {
    await services.attachmentService.recordQualityOverride(record.id, pending.qualityOverrideReason);
  }
  return record;
}

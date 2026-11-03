import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Paperclip, ScanLine, Upload, X } from 'lucide-react';
import { useServices } from '../../../services/ServiceProvider';
import { AttachmentClassificationSelect } from '../components/AttachmentClassificationSelect';
import { ExistingDocumentModal } from '../components/ExistingDocumentModal';
import { IUseCreateCorrespondenceForm } from '../state/useCreateCorrespondenceForm';
import { ISupportingDocument } from '../state/types';
import { ScanDocumentControl, IScanQualityInfo } from '../../../services/scan/ScanDocumentControl';
import { IScanResult } from '../../../services/scan/dynamsoftTypes';
import styles from './SupportingDocumentsSection.module.scss';

export interface ISupportingDocumentsSectionProps {
  form: IUseCreateCorrespondenceForm;
}

// Physical (non-digitizable) attachments are tracked with a storage location + unique resource
// identifier (CMS-003). TODO(confirm): whether this sub-form belongs here — placed in Supporting
// Documents per TASK-05 §4.3 note, as the most likely home.
export const SupportingDocumentsSection: React.FC<ISupportingDocumentsSectionProps> = ({ form }) => {
  const { t } = useTranslation();
  const { attachmentService } = useServices();
  const {
    state,
    setSupportingDocsMode,
    addSupportingDocument,
    removeSupportingDocument,
    addPhysicalAttachment,
    removePhysicalAttachment,
  } = form;
  const [showPhysicalForm, setShowPhysicalForm] = React.useState(false);
  const [physicalDescription, setPhysicalDescription] = React.useState('');
  const [physicalLocation, setPhysicalLocation] = React.useState('');
  const [persistError, setPersistError] = React.useState<string | undefined>(undefined);
  const [existingDocumentOpen, setExistingDocumentOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Only the "remove an already-persisted row" paths below still touch SharePoint directly (a
  // delete doesn't need to wait for anything) — every add path is local-only now, see
  // handleFileSelected/handleScanned/handleAddPhysical. Kept the same "always terminate the
  // promise chain with a visible failure" posture as before for those still-real calls.
  const runPersist = (work: () => Promise<void>): void => {
    setPersistError(undefined);
    work().catch(() => setPersistError(t('createCorrespondence.supportingDocs.persistFailed')));
  };

  // Nothing is uploaded here — the real file is just held in memory as pending form state
  // (rendered so the user sees it's attached) and only actually uploaded once Save Draft/Send
  // creates the correspondence item (persistPendingAttachments.ts). CMS-001 AC6/AC7 still holds:
  // every one of these becomes a real CORMS_Attachments row, just not until then.
  const handleFileSelected = (file: File): void => {
    addSupportingDocument({ name: file.name, source: 'upload', pending: { content: file, source: 'Uploaded' } });
  };

  const handleDropzoneClick = (): void => fileInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFileSelected(file);
  };

  const handleScanned = (result: IScanResult, quality: IScanQualityInfo, overrideReason?: string): void => {
    // DynamsoftScannerClient produces exactly one page per scan today (see its `pages: [page]`),
    // so one scan === one attachment; revisit if the SDK is ever configured for multi-page batches.
    const page = result.pages[0];
    addSupportingDocument({
      name: result.fileName,
      source: 'upload',
      pending: { content: page.blob, source: 'Scanned', scannedDPI: quality.scannedDPI, qualityOverrideReason: overrideReason },
    });
  };

  // Uses the same RecordsHub site → library → document browser as the Compose Document section.
  // The source file remains in RecordsHub; saving persists a CORMS attachment reference to it.
  const handleExistingSupportingSelected = (document: { fileName: string; url: string }): void => {
    const alreadyAttached = state.supportingDocuments.some(
      (doc) => doc.source === 'recordhub-reference' && doc.recordHubReferenceUrl === document.url
    );
    if (!alreadyAttached) {
      addSupportingDocument({
        name: document.fileName,
        source: 'recordhub-reference',
        recordHubReferenceUrl: document.url,
      });
    }
  };

  // CMS-034 AC6 — override a supporting document's classification (inherited from the
  // correspondence's Security Level by default). Set on the local form entry; carried through to
  // its CORMS_Attachments row when persistPendingAttachments runs at Save Draft/Send.
  const handleDocClassification = (docId: string, tier: number): void => {
    form.setField(
      'supportingDocuments',
      state.supportingDocuments.map((d) => (d.id === docId ? { ...d, securityTier: tier } : d))
    );
  };

  const handleRemoveSupportingDocument = (doc: ISupportingDocument): void => {
    if (doc.attachmentId) {
      runPersist(async () => {
        await attachmentService.remove(doc.attachmentId as string);
        removeSupportingDocument(doc.id);
      });
    } else {
      removeSupportingDocument(doc.id);
    }
  };

  // CMS-003 — the resource identifier is server-generated (PHY-{year}-{serial}), so there's
  // nothing to type; it's assigned once persistPendingAttachments creates the real row at Save
  // Draft/Send time (until then, resourceId stays unset and the row renders as "pending").
  const handleAddPhysical = (): void => {
    if (!physicalDescription.trim() || !physicalLocation.trim()) {
      return;
    }
    addPhysicalAttachment({ description: physicalDescription, storageLocation: physicalLocation });
    setPhysicalDescription('');
    setPhysicalLocation('');
    setShowPhysicalForm(false);
  };

  return (
    <>
      <p className={styles.description}>{t('createCorrespondence.supportingDocs.description')}</p>
      {persistError && <p className={styles.persistError}>{persistError}</p>}

      <div className={styles.tabsRow}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${state.supportingDocsMode === 'upload' ? styles.tabActive : ''}`}
            onClick={() => setSupportingDocsMode('upload')}
          >
            {t('createCorrespondence.supportingDocs.uploadFromComputer')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${state.supportingDocsMode === 'attach' ? styles.tabActive : ''}`}
            onClick={() => setSupportingDocsMode('attach')}
          >
            {t('createCorrespondence.supportingDocs.attachFromRecordHub')}
          </button>
        </div>
        <ScanDocumentControl onScanned={handleScanned}>
          {({ onClick, scanning, notConfigured, notConfiguredMessage }) => (
            <button
              type="button"
              className={styles.scanButton}
              disabled={notConfigured || scanning}
              title={notConfigured ? notConfiguredMessage : undefined}
              onClick={onClick}
            >
              <ScanLine size={14} /> {scanning ? t('scan.scanning') : t('createCorrespondence.compose.scanDocument')}
            </button>
          )}
        </ScanDocumentControl>
      </div>

      {state.supportingDocsMode === 'upload' ? (
        <>
          <div className={styles.dropzone} role="button" tabIndex={0} onClick={handleDropzoneClick}>
            <Upload size={28} />
            <span className={styles.dropzoneTitle}>{t('createCorrespondence.supportingDocs.dropzoneTitle')}</span>
            <span className={styles.dropzoneHelper}>{t('createCorrespondence.supportingDocs.dropzoneHelper')}</span>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" hidden onChange={handleFileInputChange} />
        </>
      ) : (
        <button type="button" className={styles.dropzone} onClick={() => setExistingDocumentOpen(true)}>
          <Paperclip size={28} />
          <span className={styles.dropzoneTitle}>{t('createCorrespondence.supportingDocs.attachFromRecordHub')}</span>
          <span className={styles.dropzoneHelper}>{t('existingDocument.sites')}</span>
        </button>
      )}

      <ExistingDocumentModal
        isOpen={existingDocumentOpen}
        onDismiss={() => setExistingDocumentOpen(false)}
        onSelect={handleExistingSupportingSelected}
      />

      {state.supportingDocuments.length > 0 && (
        <div className={styles.field}>
          <span className={styles.label}>
            {t('createCorrespondence.supportingDocs.attachedDocuments', { count: state.supportingDocuments.length })}
          </span>
          <div className={styles.docList}>
            {state.supportingDocuments.map((doc) => (
              <div key={doc.id} className={styles.docRow}>
                <Paperclip size={14} />
                <div className={styles.docInfo}>
                  <span className={styles.docName}>{doc.name}</span>
                  {doc.source === 'recordhub-reference' && (
                    <span className={styles.docMeta}>
                      {t('createCorrespondence.supportingDocs.recordHubRef', {
                        number: doc.recordNumber ?? doc.recordHubReferenceUrl,
                      })}
                    </span>
                  )}
                </div>
                {doc.source === 'recordhub-reference' && (
                  <span className={styles.docPill}>{t('createCorrespondence.supportingDocs.recordHubPill')}</span>
                )}
                <AttachmentClassificationSelect
                  value={doc.securityTier}
                  parentTier={state.securityTier}
                  onChange={(tier) => handleDocClassification(doc.id, tier)}
                />
                <button type="button" className={styles.docRemove} onClick={() => handleRemoveSupportingDocument(doc)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!showPhysicalForm && (
        <button type="button" className={styles.physicalToggle} onClick={() => setShowPhysicalForm(true)}>
          + {t('createCorrespondence.supportingDocs.addPhysicalItem')}
        </button>
      )}

      {showPhysicalForm && (
        <div className={styles.physicalForm}>
          <div className={styles.field}>
            <span className={styles.label}>{t('createCorrespondence.supportingDocs.physicalDescription')}</span>
            <input type="text" className={styles.input} value={physicalDescription} onChange={(e) => setPhysicalDescription(e.target.value)} />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>{t('createCorrespondence.supportingDocs.physicalStorageLocation')}</span>
            <input type="text" className={styles.input} value={physicalLocation} onChange={(e) => setPhysicalLocation(e.target.value)} />
          </div>
          <button type="button" className={styles.addButton} onClick={handleAddPhysical}>
            {t('createCorrespondence.supportingDocs.add')}
          </button>
        </div>
      )}

      {/* Rendered from this session's form state, never IPhysicalAttachmentService
          .getByCorrespondence() — within a single Create Correspondence session the two are the
          same set, and getByCorrespondence needs a stable correspondence id, which doesn't exist
          until the first save. resourceId is unset (renders "pending") until
          persistPendingAttachments creates the real row.
          TODO: full physical-attachment search/browse UI (IPhysicalAttachmentService.search /
          getByCorrespondence against an existing correspondence) belongs on the Detail view's
          Files tab, out of scope here — those two methods are implemented and unit-tested but
          have no UI surface yet. */}
      {state.physicalAttachments.length > 0 && (
        <div className={styles.docList}>
          {state.physicalAttachments.map((item) => (
            <div key={item.id} className={styles.docRow}>
              <span className={styles.docInfo}>
                {item.description} — {item.storageLocation} ·{' '}
                {item.resourceId ?? t('createCorrespondence.supportingDocs.resourceIdPending')}
              </span>
              <button type="button" className={styles.docRemove} onClick={() => removePhysicalAttachment(item.id)}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

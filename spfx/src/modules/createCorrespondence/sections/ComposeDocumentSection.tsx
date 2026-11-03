import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { FileSearch, FileText, ScanLine, Upload, X } from 'lucide-react';
import { useServices } from '../../../services/ServiceProvider';
import { useNav } from '../../../state/hooks/useNav';
import { ICorrespondenceTemplate } from '../../../models/ICorrespondenceMetadata';
import { RichTextEditor } from '../components/RichTextEditor';
import { AttachmentClassificationSelect } from '../components/AttachmentClassificationSelect';
import { ExistingDocumentModal } from '../components/ExistingDocumentModal';
import { IUseCreateCorrespondenceForm } from '../state/useCreateCorrespondenceForm';
import { ScanDocumentControl, IScanQualityInfo } from '../../../services/scan/ScanDocumentControl';
import { IScanResult } from '../../../services/scan/dynamsoftTypes';
import { IFormErrors } from '../state/types';
import { buildSignOff, buildTemplateValues, interpolatePlaceholders } from '../state/templateContent';
import styles from './ComposeDocumentSection.module.scss';

export interface IComposeDocumentSectionProps {
  form: IUseCreateCorrespondenceForm;
  errors?: IFormErrors;
}

// Item 3 — the in-app "Scan Document" button is hidden: scanning is now handled by choosing the
// Channel = Scan and bringing the scanned file in via the Existing Document tab, so the button is
// redundant. Intentionally kept (not deleted) behind this flag — flip to true to restore it.
const SHOW_SCAN_BUTTON = false;

export const ComposeDocumentSection: React.FC<IComposeDocumentSectionProps> = ({ form, errors = {} }) => {
  const { t } = useTranslation();
  const { templatesService } = useServices();
  const { currentUser } = useNav();
  const { state, setComposeMode, applyTemplate, setField } = form;
  const [templates, setTemplates] = React.useState<ICorrespondenceTemplate[]>([]);
  const [existingModalOpen, setExistingModalOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    templatesService
      .getTemplates()
      .then(setTemplates)
      .catch(() => undefined);
  }, [templatesService]);

  // CMS-005 AC5/AC13 — originators may only author against an approved template. Unapproved (draft)
  // templates are authored/edited from Administration but never offered in the Compose picker.
  // `approved === undefined` is treated as approved so pre-existing rows without the column show.
  const approvedTemplates = React.useMemo(
    () => templates.filter((tpl) => tpl.approved !== false),
    [templates]
  );

  // CMS-005 AC12 — the sender's role is resolved only "where known": when the sender is the signed-in
  // user we can read their job title; for anyone else it stays blank and the sign-off omits the role
  // line entirely. TODO(confirm): a directory lookup keyed on an arbitrary sender name if the
  // From value can ever be someone other than the current user.
  const senderRole = React.useMemo(() => {
    const senderIsCurrentUser = !!currentUser && state.sender.trim() === currentUser.displayName.trim();
    if (!senderIsCurrentUser || !currentUser) return '';
    return currentUser.jobTitle || (currentUser.jobTitleKey ? t(currentUser.jobTitleKey) : '') || '';
  }, [currentUser, state.sender, t]);

  const selectedTemplate = React.useMemo(
    () => approvedTemplates.find((tpl) => tpl.id === state.selectedTemplateId),
    [approvedTemplates, state.selectedTemplateId]
  );

  // CMS-005 AC11/AC14 — the letterhead regions and sign-off re-interpolate live from the raw
  // template (templateHeader/templateFooter store the raw, placeholder-carrying strings) and the
  // current correspondence data, so changing the Sender/From — or any other datum — updates the
  // preview immediately while the authored body is never touched.
  const values = React.useMemo(() => buildTemplateValues(state, senderRole), [state, senderRole]);
  const previewHeader = React.useMemo(
    () => interpolatePlaceholders(state.templateHeader, values),
    [state.templateHeader, values]
  );
  const previewFooter = React.useMemo(
    () => interpolatePlaceholders(state.templateFooter, values),
    [state.templateFooter, values]
  );
  const previewSignOff = React.useMemo(
    () => buildSignOff(state.sender, senderRole),
    [state.sender, senderRole]
  );

  const handleSelectTemplate = (template: ICorrespondenceTemplate): void => {
    // AC3 — template selection controls the header/footer letterhead only. The raw (un-interpolated)
    // header/footer are stored so they re-interpolate as the data changes (AC11/AC14).
    applyTemplate(template.id, template.header, template.footer, template.version);
    // AC3 — the body is seeded from the template only when empty; switching templates afterwards
    // must preserve whatever the user has already written.
    if (!state.bodyHtml.trim()) {
      setField('bodyHtml', interpolatePlaceholders(template.bodyHtml, values));
    }
  };

  // Nothing is uploaded here — the real local file is just held in memory as pending form state
  // (rendered so the user sees it's attached) and only actually uploaded once Save Draft/Send
  // creates the correspondence item (persistPendingAttachments.ts). Mirrors
  // SupportingDocumentsSection's own handleFileSelected. Shared by both the Outgoing "Upload
  // Document" tab and Incoming's compose flow below.
  // pendingMainDocument is a single slot — picking a file replaces a previous scan (and vice
  // versa), so the name of whichever one it replaced is cleared too. Otherwise the dropzone would
  // keep showing a stale name that no longer matches the document that will actually be saved.
  const handleFileSelected = (file: File): void => {
    setField('pendingMainDocument', { fileName: file.name, content: file, source: 'Uploaded' });
    setField('uploadedDocumentName', file.name);
    setField('scannedDocumentName', undefined);
    setField('existingDocumentName', undefined);
    setField('existingDocumentUrl', undefined);
  };

  const handleDropzoneClick = (): void => fileInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file name after a removal/replace
    if (file) handleFileSelected(file);
  };

  // Clears whichever compose document is attached (there's only ever one) so the uploader returns
  // to its empty state.
  const handleRemoveMainDocument = (): void => {
    setField('pendingMainDocument', undefined);
    setField('uploadedDocumentName', undefined);
    setField('scannedDocumentName', undefined);
    setField('existingDocumentName', undefined);
    setField('existingDocumentUrl', undefined);
  };

  // Existing Documents are references: do not download Blob bytes or upload a duplicate file.
  const handleExistingSelected = (file: { fileName: string; url: string }): void => {
    setField('pendingMainDocument', undefined);
    setField('existingDocumentName', file.fileName);
    setField('existingDocumentUrl', file.url);
    setField('uploadedDocumentName', undefined);
    setField('scannedDocumentName', undefined);
  };

  // CMS-034 AC6 — override the main document's classification (inherited from the correspondence's
  // Security Level by default). Only meaningful while the document is still pending (not yet
  // persisted); a reopened draft's already-filed main document isn't re-classified from here.
  const handleMainDocClassification = (tier: number): void => {
    if (!state.pendingMainDocument) return;
    setField('pendingMainDocument', { ...state.pendingMainDocument, securityTier: tier });
  };

  // The single attached compose document (upload or scan), rendered as a removable file row beneath
  // the dropzone — the same affordance Supporting Documents gives its files.
  const mainDocumentName =
    state.pendingMainDocument?.fileName ??
    state.uploadedDocumentName ??
    state.scannedDocumentName ??
    state.existingDocumentName;
  const mainDocumentMeta =
    state.pendingMainDocument?.source === 'Scanned'
      ? t('createCorrespondence.compose.scannedDocument')
      : state.existingDocumentName
        ? t('createCorrespondence.compose.fromExistingDocument')
        : t('createCorrespondence.supportingDocs.uploadFromComputer');
  const renderUploadedDoc = (): React.ReactNode =>
    mainDocumentName ? (
      <div className={styles.uploadedDoc}>
        <FileText size={16} />
        <div className={styles.uploadedDocInfo}>
          <span className={styles.uploadedDocName}>{mainDocumentName}</span>
          <span className={styles.uploadedDocMeta}>{mainDocumentMeta}</span>
        </div>
        {state.pendingMainDocument && (
          <AttachmentClassificationSelect
            value={state.pendingMainDocument.securityTier}
            parentTier={state.securityTier}
            onChange={handleMainDocClassification}
          />
        )}
        <button
          type="button"
          className={styles.uploadedDocRemove}
          onClick={handleRemoveMainDocument}
          aria-label={t('createCorrespondence.supportingDocs.remove')}
        >
          <X size={14} />
        </button>
      </div>
    ) : null;

  // CMS-002 — real Dynamsoft scan + quality gate. The scanned page is held as pending form state,
  // same as a picked file — actual persistence (draft-folder-free upload + CORMS_Attachments
  // metadata row) happens once Save Draft/Send creates the correspondence item.
  const handleScanned = (result: IScanResult, quality: IScanQualityInfo, overrideReason?: string): void => {
    // DynamsoftScannerClient produces exactly one page per scan today (see its `pages: [page]`),
    // so one scan === one attachment; revisit if the SDK is ever configured for multi-page batches.
    const page = result.pages[0];
    setField('pendingMainDocument', {
      fileName: result.fileName,
      content: page.blob,
      source: 'Scanned',
      scannedDPI: quality.scannedDPI,
      qualityOverrideReason: overrideReason,
    });
    setField('scannedDocumentName', result.fileName);
    setField('uploadedDocumentName', undefined);
  };

  // Incoming has no "Use Template" tab (you're recording a received letter, not drafting one) — but
  // it gets the same tabbed Upload / Existing Document pairing as Outgoing (with the Scan button on
  // the right), so the two directions share one UI (CMS-005 AC7 — template authoring is not offered
  // for incoming). Incoming only ever uses 'upload' or 'existing'; a leftover 'template' from a prior
  // Outgoing state reads as the Upload tab here.
  if (state.correspondenceType === 'Incoming') {
    return (
      <>
        <div className={styles.tabsRow}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${state.composeMode !== 'existing' ? styles.tabActive : ''}`}
              onClick={() => setComposeMode('upload')}
            >
              {t('createCorrespondence.compose.uploadDocument')}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${state.composeMode === 'existing' ? styles.tabActive : ''}`}
              onClick={() => setComposeMode('existing')}
            >
              {t('createCorrespondence.compose.existingDocument')}
            </button>
          </div>
          {SHOW_SCAN_BUTTON && (
            <ScanDocumentControl onScanned={handleScanned}>
              {({ onClick, scanning, notConfigured, notConfiguredMessage }) => (
                <button
                  type="button"
                  className={styles.scanButton}
                  disabled={notConfigured || scanning}
                  title={notConfigured ? notConfiguredMessage : undefined}
                  onClick={onClick}
                >
                  <ScanLine size={14} />{' '}
                  {scanning ? t('scan.scanning') : t('createCorrespondence.compose.scanDocument')}
                </button>
              )}
            </ScanDocumentControl>
          )}
        </div>
        {state.composeMode === 'existing' ? (
          <div
            className={styles.dropzone}
            role="button"
            tabIndex={0}
            data-validation-field="composeDocument"
            aria-invalid={!!errors.composeDocument}
            onClick={() => setExistingModalOpen(true)}
          >
            <FileSearch size={28} />
            <span className={styles.dropzoneTitle}>
              {t('createCorrespondence.compose.existingDropzoneTitle')}
            </span>
            <span className={styles.dropzoneHelper}>
              {t('createCorrespondence.compose.existingDropzoneHelper')}
            </span>
          </div>
        ) : (
          <>
            <div
              className={styles.dropzone}
              role="button"
              tabIndex={0}
              data-validation-field="composeDocument"
              aria-invalid={!!errors.composeDocument}
              onClick={handleDropzoneClick}
            >
              <Upload size={28} />
              <span className={styles.dropzoneTitle}>{t('createCorrespondence.compose.dropzoneTitle')}</span>
              <span className={styles.dropzoneHelper}>
                {t('createCorrespondence.compose.dropzoneHelperCompose')}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              hidden
              onChange={handleFileInputChange}
            />
          </>
        )}
        {renderUploadedDoc()}
        {errors.composeDocument && <span className={styles.error}>{t(errors.composeDocument)}</span>}
        <ExistingDocumentModal
          isOpen={existingModalOpen}
          onDismiss={() => setExistingModalOpen(false)}
          onSelect={handleExistingSelected}
        />
      </>
    );
  }

  return (
    <>
      <div className={styles.tabsRow}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${state.composeMode === 'upload' ? styles.tabActive : ''}`}
            onClick={() => setComposeMode('upload')}
          >
            {t('createCorrespondence.compose.uploadDocument')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${state.composeMode === 'template' ? styles.tabActive : ''}`}
            onClick={() => setComposeMode('template')}
          >
            {t('createCorrespondence.compose.useTemplate')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${state.composeMode === 'existing' ? styles.tabActive : ''}`}
            onClick={() => setComposeMode('existing')}
          >
            {t('createCorrespondence.compose.existingDocument')}
          </button>
        </div>
        {SHOW_SCAN_BUTTON && (
          <ScanDocumentControl onScanned={handleScanned}>
            {({ onClick, scanning, notConfigured, notConfiguredMessage }) => (
              <button
                type="button"
                className={styles.scanButton}
                disabled={notConfigured || scanning}
                title={notConfigured ? notConfiguredMessage : undefined}
                onClick={onClick}
              >
                <ScanLine size={14} />{' '}
                {scanning ? t('scan.scanning') : t('createCorrespondence.compose.scanDocument')}
              </button>
            )}
          </ScanDocumentControl>
        )}
      </div>

      {state.composeMode === 'upload' ? (
        <>
          <div
            className={styles.dropzone}
            role="button"
            tabIndex={0}
            data-validation-field="composeDocument"
            aria-invalid={!!errors.composeDocument}
            onClick={handleDropzoneClick}
          >
            <Upload size={28} />
            <span className={styles.dropzoneTitle}>{t('createCorrespondence.compose.dropzoneTitle')}</span>
            <span className={styles.dropzoneHelper}>
              {t('createCorrespondence.compose.dropzoneHelperCompose')}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            hidden
            onChange={handleFileInputChange}
          />
          {renderUploadedDoc()}
        </>
      ) : state.composeMode === 'existing' ? (
        <>
          <div
            className={styles.dropzone}
            role="button"
            tabIndex={0}
            data-validation-field="composeDocument"
            aria-invalid={!!errors.composeDocument}
            onClick={() => setExistingModalOpen(true)}
          >
            <FileSearch size={28} />
            <span className={styles.dropzoneTitle}>
              {t('createCorrespondence.compose.existingDropzoneTitle')}
            </span>
            <span className={styles.dropzoneHelper}>
              {t('createCorrespondence.compose.existingDropzoneHelper')}
            </span>
          </div>
          {renderUploadedDoc()}
        </>
      ) : (
        <>
          <div className={styles.field}>
            <span className={styles.label}>{t('createCorrespondence.compose.selectTemplate')}</span>
            <div className={styles.templatePills}>
              {approvedTemplates.map((template, index) => (
                <button
                  key={template.id}
                  type="button"
                  className={`${styles.templatePill} ${state.selectedTemplateId === template.id ? styles.templatePillActive : ''}`}
                  data-validation-field={!selectedTemplate && index === 0 ? 'composeDocument' : undefined}
                  aria-invalid={!selectedTemplate && !!errors.composeDocument}
                  onClick={() => handleSelectTemplate(template)}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* CMS-005 AC5 — an approved template must be selected before authoring. Until then the
              letterhead preview and the editor are withheld and the originator is prompted to pick one. */}
          {selectedTemplate ? (
            <div className={styles.letterhead}>
              {/* AC4 — the header letterhead is a live preview above the editor body. */}
              <div className={styles.previewRegion} dir={state.bodyDir}>
                <span className={styles.previewBadge}>{t('createCorrespondence.compose.header')}</span>
                {previewHeader.trim() ? (
                  <div
                    className={styles.previewContent}
                    dangerouslySetInnerHTML={{ __html: previewHeader }}
                  />
                ) : (
                  <span className={styles.previewEmpty}>
                    {t('createCorrespondence.compose.headerPlaceholder')}
                  </span>
                )}
              </div>

              <RichTextEditor
                value={state.bodyHtml}
                dir={state.bodyDir}
                onChange={(html) => setField('bodyHtml', html)}
                onDirChange={(dir) => setField('bodyDir', dir)}
                placeholder={t('createCorrespondence.compose.bodyPlaceholder')}
                validationField="composeDocument"
                invalid={!!errors.composeDocument}
              />

              {/* AC12 — the auto sign-off, re-interpolated with the sender's name and (where known) role. */}
              <div className={styles.previewRegion} dir={state.bodyDir}>
                <span className={styles.previewBadge}>{t('createCorrespondence.compose.signOff')}</span>
                <div className={styles.previewContent} dangerouslySetInnerHTML={{ __html: previewSignOff }} />
              </div>

              {/* AC4 — the footer letterhead is a live preview below the editor body. */}
              <div className={styles.previewRegion} dir={state.bodyDir}>
                <span className={styles.previewBadge}>{t('createCorrespondence.compose.footer')}</span>
                {previewFooter.trim() ? (
                  <div
                    className={styles.previewContent}
                    dangerouslySetInnerHTML={{ __html: previewFooter }}
                  />
                ) : (
                  <span className={styles.previewEmpty}>
                    {t('createCorrespondence.compose.footerPlaceholder')}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              className={styles.selectTemplatePrompt}
              data-validation-field={approvedTemplates.length === 0 ? 'composeDocument' : undefined}
              tabIndex={approvedTemplates.length === 0 ? -1 : undefined}
              aria-invalid={!!errors.composeDocument}
            >
              {t('createCorrespondence.compose.selectTemplateFirst')}
            </div>
          )}
        </>
      )}
      {errors.composeDocument && <span className={styles.error}>{t(errors.composeDocument)}</span>}
      {/* A template letter is generated here, so only an uploaded or existing file can arrive signed. */}
      {state.composeMode !== 'template' && (
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={state.mainDocumentSigned}
            onChange={(e) => setField('mainDocumentSigned', e.target.checked)}
          />
          <span>
            {t('createCorrespondence.compose.signed')}
            <span className={styles.checkboxHelper}>{t('createCorrespondence.compose.signedHelper')}</span>
          </span>
        </label>
      )}
      <ExistingDocumentModal
        isOpen={existingModalOpen}
        onDismiss={() => setExistingModalOpen(false)}
        onSelect={handleExistingSelected}
      />
    </>
  );
};

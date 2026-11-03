import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Reply, Save, Send } from 'lucide-react';
import { useServices } from '../../services/ServiceProvider';
import { useNav } from '../../state/hooks/useNav';
import { IReplyPrefill } from '../../utils/replyPrefill';
import { CollapsibleSection } from './components/CollapsibleSection';
import { CoreMetadataSection } from './sections/CoreMetadataSection';
import { ComposeDocumentSection } from './sections/ComposeDocumentSection';
import { SupportingDocumentsSection } from './sections/SupportingDocumentsSection';
import { ApprovalWorkflowSection } from './sections/ApprovalWorkflowSection';
import { useCreateCorrespondenceForm } from './state/useCreateCorrespondenceForm';
import { validateForSend } from './state/validateForm';
import { useClassifiedCaptureThreshold } from './state/useClassifiedCaptureThreshold';
import { isVettedForClassifiedCapture } from '../../utils/correspondenceFlags';
import { buildPayloadFromFormState } from './state/buildPayload';
import { buildApprovalChainPayload } from './state/approvalChain';
import { useDraftAutosave } from './state/useDraftAutosave';
import { persistPendingAttachments } from './state/persistPendingAttachments';
import { IFormErrors, isMainDocumentSigned } from './state/types';
import { focusFirstInvalidField, validationSection } from './state/validationFocus';
import {
  CorrespondenceValidationError,
  ICreateCorrespondenceResult,
} from '../../models/ICorrespondencePayload';
import styles from './CreateCorrespondenceView.module.scss';

const DEFAULT_MAX_CLEARANCE = 1;

const CreateCorrespondenceView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    correspondenceService,
    attachmentService,
    attachmentStorageService,
    physicalAttachmentService,
    approvalTaskService,
  } = useServices();
  const { currentUser } = useNav();

  const senderName = currentUser?.displayName ?? '';
  const maxClearanceTier = currentUser?.clearanceTier ?? DEFAULT_MAX_CLEARANCE;

  // CMS-034 AC5 — the configurable vetted-only capture threshold, and whether this user is vetted.
  const classifiedCaptureThreshold = useClassifiedCaptureThreshold();
  const isVetted = isVettedForClassifiedCapture(currentUser);

  const form = useCreateCorrespondenceForm(senderName, currentUser?.id);

  // CMS-005 AC12 — the sign-off role is resolved "where known": only when the sender is still the
  // signed-in user can we read their job title; for anyone else it stays blank and the role line is
  // omitted. Mirrors ComposeDocumentSection's own resolution so the preview and the assembled
  // document agree.
  const senderIsCurrentUser = !!currentUser && form.state.sender.trim() === currentUser.displayName.trim();
  const senderRole = senderIsCurrentUser
    ? currentUser.jobTitle || (currentUser.jobTitleKey ? t(currentUser.jobTitleKey) : '') || ''
    : '';

  React.useEffect(() => {
    // Identity can resolve after the form mounts. Only seed a truly untouched sender so a hydrated
    // draft/reply or an explicit picker edit is never overwritten.
    if (senderName && !form.state.sender && !form.state.senderId) {
      form.setField('sender', senderName);
      form.setField('senderId', currentUser?.id);
    }
  }, [senderName, currentUser?.id, form]);

  // Edit-a-draft (CMS draft submit): the Drafts list opens a draft here with its id, so the user can
  // review every field and then either keep editing (Save Draft) or submit it (Send). We reload the
  // draft's persisted fields into the form and stash existingId, so both buttons update that same
  // row instead of creating a duplicate.
  const editDraftId = (location.state as { editDraftId?: string } | null)?.editDraftId;
  const [isEditingDraft, setIsEditingDraft] = React.useState(!!editDraftId);
  const loadedDraftRef = React.useRef(false);
  React.useEffect(() => {
    if (!editDraftId || loadedDraftRef.current) return;
    loadedDraftRef.current = true;
    correspondenceService
      .getDraftForEdit(editDraftId)
      .then((draft) => {
        if (!draft) {
          setIsEditingDraft(false);
          return;
        }
        form.hydrate({
          existingId: draft.existingId,
          // CMS-022 — keep a drafted reply linked to its thread when reopened for edit/submit.
          chainId: draft.chainId,
          parentReplyToId: draft.parentId,
          subject: draft.subject,
          correspondenceType: draft.direction,
          priority: draft.priority,
          contentTypeId: draft.contentType,
          contentTypeName: draft.contentType,
          channel: draft.channel,
          originatingFunction: draft.originatingFunction,
          securityTier: draft.securityTier,
          recordClassificationId: draft.recordClassification,
          recordClassificationLabel: draft.recordClassification,
          destinationType: draft.destinationType,
          // The row stores display names only — use each name as both id and label (the SearchableSelect
          // chips and buildPayload both key off the names). Re-pick to attach a resolved directory entry.
          destinationDepartmentIds: draft.destinationDepartments,
          destinationDepartmentNames: draft.destinationDepartments,
          externalOrgIds: draft.externalOrganizations,
          externalOrgNames: draft.externalOrganizations,
          sender: draft.sender ?? senderName,
          senderId: draft.senderId,
          existingDocumentName: draft.existingDocumentName,
          existingDocumentUrl: draft.existingDocumentUrl,
          recipientIds: draft.recipients,
          recipientNames: draft.recipients,
          dateCreated: draft.dateCreated || form.state.dateCreated,
          dueDate: draft.dueDate,
          deliveryEmail: draft.deliveryEmail,
          deliveryPhysicalMail: draft.deliveryPhysicalMail,
          physicalDispatch: draft.physicalDispatch,
          comments: draft.comments,
          mainDocumentSigned: draft.mainDocumentSigned,
        });
      })
      .catch(() => setIsEditingDraft(false));
  }, [editDraftId, correspondenceService, form, senderName]);

  // Reply prefill (CMS-041) — subject/recipient seeded once from the detail view's Reply action.
  const replyTo = (location.state as { replyTo?: IReplyPrefill } | null)?.replyTo;
  const appliedReplyRef = React.useRef(false);
  React.useEffect(() => {
    if (!replyTo || appliedReplyRef.current) return;
    appliedReplyRef.current = true;
    form.setField('subject', replyTo.subject);
    // Reply carries only a display name (no login/claims key), so seed the picker with the name as
    // both id and label — the user can re-pick a real directory entry if they need the resolved user.
    if (replyTo.recipientName) form.toggleRecipient(replyTo.recipientName, replyTo.recipientName);
    form.setCorrespondenceType('Outgoing');
    // CMS-022 AC1 — the reply inherits the parent's chain and remembers the parent, so on submit it
    // joins the thread and reuses the chain's controlled number instead of starting a new chain.
    if (replyTo.chainId) form.setField('chainId', replyTo.chainId);
    if (replyTo.parentId) form.setField('parentReplyToId', replyTo.parentId);
    // CMS-041 AC8 — pre-fill the source item's core metadata (all editable before sending).
    if (replyTo.priority) form.setField('priority', replyTo.priority);
    if (typeof replyTo.securityTier === 'number') form.setField('securityTier', replyTo.securityTier);
    if (replyTo.recordClassificationId) {
      form.setField('recordClassificationId', replyTo.recordClassificationId);
      form.setField(
        'recordClassificationLabel',
        replyTo.recordClassificationLabel ?? replyTo.recordClassificationId
      );
    }
    if (replyTo.originatingFunction) form.setField('originatingFunction', replyTo.originatingFunction);
  }, [replyTo, form]);

  const [errors, setErrors] = React.useState<IFormErrors>({});
  const [validationFocus, setValidationFocus] = React.useState<
    { errors: IFormErrors; request: number } | undefined
  >(undefined);
  const validationRequestRef = React.useRef(0);
  // Which action is in flight, so only the clicked button shows its loader (both stay disabled).
  const [submittingAction, setSubmittingAction] = React.useState<'draft' | 'send' | undefined>(undefined);
  const submitting = submittingAction !== undefined;
  const [confirmation, setConfirmation] = React.useState<
    { referenceNumber: string; subject: string } | undefined
  >(undefined);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);

  const isOutgoing = form.state.correspondenceType === 'Outgoing';
  // An already-signed main document needs no approvers, so the approval section is withheld.
  const showApprovalWorkflow = isOutgoing && !isMainDocumentSigned(form.state);

  // Focus is intentionally scheduled only after Send validation has rendered its errors. The
  // timeout also gives a collapsed section its layout-effect turn to reopen before its target is
  // queried; ordinary form changes never enter this path and therefore retain the user's focus.
  React.useEffect(() => {
    if (!validationFocus) return undefined;
    const timeoutId = window.setTimeout(() => {
      focusFirstInvalidField(validationFocus.errors);
      setValidationFocus(undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [validationFocus]);

  const requestValidationFocus = React.useCallback((validationErrors: IFormErrors): void => {
    validationRequestRef.current += 1;
    setValidationFocus({ errors: validationErrors, request: validationRequestRef.current });
  }, []);

  // Runs after every successful create() — uploads every picked/scanned file and creates every
  // attachment/physical-attachment row for real, now that the correspondence item exists (see
  // persistPendingAttachments.ts). Deliberately non-fatal: the CORMS_Correspondence row is already
  // committed by the time this runs, so a failure here must not be reported as "save/send failed"
  // (and must not become an unhandled rejection either — the rest of this codebase always
  // terminates its promise chains with a .catch).
  const finalizeAttachments = async (result: ICreateCorrespondenceResult): Promise<void> => {
    try {
      const persisted = await persistPendingAttachments(
        { attachmentService, attachmentStorageService, physicalAttachmentService },
        form.state,
        result.id,
        // CMS AC11 — fold files under Year/Month/Serial using the row's own DateCreated + the issued
        // reference number (from the create result, not the possibly-stale form field).
        { dateCreated: result.dateCreated, referenceNumber: result.referenceNumber }
      );
      if (persisted.mainDocumentPersisted) form.setField('pendingMainDocument', undefined);
      form.setField('supportingDocuments', persisted.supportingDocuments);
      form.setField('physicalAttachments', persisted.physicalAttachments);
    } catch {
      setSaveError(t('createCorrespondence.validation.attachmentsFinalizeFailed'));
    }
  };

  // Save Draft (CMS-005/CMS-004/CMS-001): persists real server-side state via
  // ICorrespondenceService.create(mode:'draft') — Status stays 'Draft', no reference number is
  // consumed. The returned id is stashed as existingId so a repeat Save Draft click on this same
  // session updates the row instead of inserting a duplicate.
  const handleSaveDraft = async (): Promise<void> => {
    setSaveError(undefined);
    setSubmittingAction('draft');
    try {
      const result = await correspondenceService.create(
        buildPayloadFromFormState(form.state, senderRole),
        'draft'
      );
      // Awaited before navigating away — this component unmounts on navigate, and a detached
      // promise would both lose its errors and try to setState on an unmounted component.
      await finalizeAttachments(result);
      form.setField('existingId', result.id);
      navigate('/inbox-sent/drafts');
    } catch {
      setSaveError(t('createCorrespondence.validation.saveDraftFailed'));
    } finally {
      setSubmittingAction(undefined);
    }
  };

  const handleSend = async (): Promise<void> => {
    const validationErrors = validateForSend(form.state, {
      classifiedCaptureThreshold,
      isVettedForClassifiedCapture: isVetted,
    });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      requestValidationFocus(validationErrors);
      return;
    }

    setSaveError(undefined);
    setSubmittingAction('send');
    try {
      const result = await correspondenceService.create(
        buildPayloadFromFormState(form.state, senderRole),
        'submit'
      );
      // Every pending attachment (main document, supporting documents, physical items) is uploaded
      // and persisted for real here, now that the correspondence item's real id exists (CMS-002
      // Part 2) — before the confirmation screen replaces this one.
      await finalizeAttachments(result);
      // CMS-006 AC9 — route the draft: create one SharePoint approval Task per participant from the
      // built chain (Outgoing + at least one step). Non-fatal like finalizeAttachments — the
      // correspondence row is already committed, so a routing hiccup must not read as "send failed".
      if (showApprovalWorkflow && form.state.approvalSteps.length > 0) {
        try {
          await approvalTaskService.createTasksForChain(
            result.id,
            result.referenceNumber,
            buildApprovalChainPayload(form.state.approvalSteps)
          );
        } catch {
          setSaveError(t('createCorrespondence.validation.routingFailed'));
        }
      }
      form.setField('existingId', result.id);
      if (result.referenceNumber) {
        form.setField('referenceNumber', result.referenceNumber);
        setConfirmation({ referenceNumber: result.referenceNumber, subject: form.state.subject });
      }
      // CMS-005 AC15 — the print-ready document (interpolated letterhead + authored body + auto
      // sign-off + footer) is assembled in buildPayloadFromFormState and carried on the payload as
      // composedDocumentHtml; rendering that HTML to the binary PDF that becomes the main document
      // is a downstream server step. CMS-006 AC13 — the per-step outcome email to the originator
      // is the one remaining Power Automate piece (deferred).
    } catch (err) {
      if (err instanceof CorrespondenceValidationError) {
        const fieldErrors: IFormErrors = {};
        err.errors.forEach((e) => {
          fieldErrors[e.field] = 'createCorrespondence.validation.required';
        });
        setErrors(fieldErrors);
        requestValidationFocus(fieldErrors);
      } else {
        setSaveError(t('createCorrespondence.validation.sendFailed'));
      }
    } finally {
      setSubmittingAction(undefined);
    }
  };

  // CMS-005 AC8 — the draft is saved server-side automatically as the author works, so their work
  // is never lost and the draft is reopenable on any device/session. It persists the same
  // Status:'Draft' row Save Draft does (reusing existingId so it updates rather than duplicates),
  // but deliberately does NOT finalize attachments on every keystroke-triggered save — pending
  // files stay in memory and are uploaded once at manual Save Draft / Send, avoiding repeated
  // re-uploads. It never navigates away.
  const autosaveDraft = React.useCallback(async (): Promise<void> => {
    const result = await correspondenceService.create(
      buildPayloadFromFormState(form.state, senderRole),
      'draft'
    );
    form.setField('existingId', result.id);
  }, [correspondenceService, form, senderRole]);

  const { status: autosaveStatus } = useDraftAutosave({
    state: form.state,
    // Stand down while a manual Save Draft/Send is in flight or the confirmation screen is shown.
    enabled: !submitting && !confirmation,
    save: autosaveDraft,
  });

  if (confirmation) {
    return (
      <div className={styles.page}>
        <div className={styles.confirmation}>
          <h2>{t('createCorrespondence.confirmation.title')}</h2>
          {confirmation.subject && <div className={styles.confirmationSubject}>{confirmation.subject}</div>}
          <div className={styles.confirmationNumber}>{confirmation.referenceNumber}</div>
          <p>{t('createCorrespondence.confirmation.description')}</p>
          {saveError && <div className={styles.errorBanner}>{saveError}</div>}
          <button
            type="button"
            className={`${styles.footerButton} ${styles.footerButtonPrimary}`}
            onClick={() => navigate('/my-correspondence')}
          >
            {t('createCorrespondence.confirmation.goToMyCorrespondence')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Full-screen busy overlay while Save Draft / Send is in flight — dims everything and blocks
          further clicks so the user can't double-submit or edit mid-save (the buttons also disable). */}
      {submitting && (
        <div className={styles.busyOverlay} role="alert" aria-busy="true" aria-live="assertive">
          <div className={styles.busyDialog}>
            <span className={styles.busySpinner} aria-hidden="true" />
            <span className={styles.busyLabel}>
              {submittingAction === 'send'
                ? t('createCorrespondence.overlay.sending')
                : t('createCorrespondence.overlay.savingDraft')}
            </span>
          </div>
        </div>
      )}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <button type="button" className={styles.backButton} onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> {t('createCorrespondence.back')}
          </button>
          <h1 className={styles.title}>
            {isEditingDraft ? t('createCorrespondence.editTitle') : t('createCorrespondence.title')}
          </h1>
          <p className={styles.subtitle}>
            {isEditingDraft ? t('createCorrespondence.editSubtitle') : t('createCorrespondence.subtitle')}
          </p>
        </div>
        <div className={styles.headerActions}>
          {/* CMS-005 AC8 — a quiet indication that the draft is being saved automatically. */}
          {autosaveStatus !== 'idle' && (
            <span className={styles.autosaveStatus} aria-live="polite">
              {autosaveStatus === 'saving' && t('createCorrespondence.autosave.saving')}
              {autosaveStatus === 'saved' && t('createCorrespondence.autosave.saved')}
              {autosaveStatus === 'error' && t('createCorrespondence.autosave.error')}
            </span>
          )}
          <button
            type="button"
            className={styles.actionButton}
            disabled={submitting}
            onClick={handleSaveDraft}
          >
            {submittingAction === 'draft' ? (
              <span className={styles.buttonSpinner} aria-hidden="true" />
            ) : (
              <Save size={14} />
            )}{' '}
            {t('createCorrespondence.saveDraft')}
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
            disabled={submitting}
            onClick={handleSend}
          >
            {submittingAction === 'send' ? (
              <span className={styles.buttonSpinner} aria-hidden="true" />
            ) : (
              <Send size={14} />
            )}{' '}
            {t('createCorrespondence.send')}
          </button>
        </div>
      </div>

      {/* CMS-041 AC5 — a persistent, clear indication (visible before sending) that this outgoing
          item is a reply linked to an existing thread. */}
      {form.state.chainId && (
        <div className={styles.replyBanner}>
          <Reply size={14} />
          <span>{t('createCorrespondence.replyBanner', { ref: form.state.chainId })}</span>
        </div>
      )}

      {Object.keys(errors).length > 0 && (
        <div className={styles.errorBanner}>{t('createCorrespondence.validation.summary')}</div>
      )}
      {saveError && <div className={styles.errorBanner}>{saveError}</div>}

      <div className={styles.sections}>
        <CollapsibleSection
          number={1}
          title={t('createCorrespondence.section.coreMetadata')}
          badgeText={t('createCorrespondence.badge.required')}
          openRequest={
            validationSection(validationFocus?.errors ?? {}) === 'coreMetadata'
              ? validationFocus?.request
              : undefined
          }
        >
          <CoreMetadataSection
            form={form}
            maxClearanceTier={maxClearanceTier}
            errors={errors}
            classifiedCaptureThreshold={classifiedCaptureThreshold}
            isVetted={isVetted}
          />
        </CollapsibleSection>

        <CollapsibleSection
          number={2}
          title={t('createCorrespondence.section.composeDocument')}
          badgeText={t('createCorrespondence.badge.required')}
          openRequest={
            validationSection(validationFocus?.errors ?? {}) === 'composeDocument'
              ? validationFocus?.request
              : undefined
          }
        >
          <ComposeDocumentSection form={form} errors={errors} />
        </CollapsibleSection>

        <CollapsibleSection number={3} title={t('createCorrespondence.section.supportingDocuments')}>
          <SupportingDocumentsSection form={form} />
        </CollapsibleSection>

        {showApprovalWorkflow && (
          <CollapsibleSection
            number={4}
            title={t('createCorrespondence.section.approvalWorkflow')}
            openRequest={
              validationSection(validationFocus?.errors ?? {}) === 'approvalWorkflow'
                ? validationFocus?.request
                : undefined
            }
          >
            <ApprovalWorkflowSection form={form} />
          </CollapsibleSection>
        )}
      </div>

      <div className={styles.footerActions}>
        <button type="button" className={styles.footerButton} disabled={submitting} onClick={handleSaveDraft}>
          {submittingAction === 'draft' ? (
            <span className={styles.buttonSpinner} aria-hidden="true" />
          ) : (
            <Save size={14} />
          )}{' '}
          {t('createCorrespondence.saveDraft')}
        </button>
        <button
          type="button"
          className={`${styles.footerButton} ${styles.footerButtonPrimary}`}
          disabled={submitting}
          onClick={handleSend}
        >
          {submittingAction === 'send' ? (
            <span className={styles.buttonSpinner} aria-hidden="true" />
          ) : (
            <Send size={14} />
          )}{' '}
          {t('createCorrespondence.send')}
        </button>
      </div>
    </div>
  );
};

export default CreateCorrespondenceView;

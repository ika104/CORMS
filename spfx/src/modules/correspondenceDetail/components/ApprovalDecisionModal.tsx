import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, PenLine } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Spinner } from '../../../components/common/Spinner';
import { ApprovalDecision, IApprovalTask } from '../../../models/IApprovalTask';
import { ISignatureRequestResult } from '../../../models/IESignature';
import { pageSigningReturnUrl } from '../../../services/esignature/signingReturn';
import { SigningFrameModal, SigningFrameOutcome } from './SigningFrameModal';
import styles from './ApprovalDecisionModal.module.scss';

export interface IApprovalDecisionModalProps {
  isOpen: boolean;
  task: IApprovalTask;
  outcome: ApprovalDecision;
  title: string;
  confirmText: string;
  confirmTone?: 'primary' | 'danger';
  /** Raises the reviewer's signing request and resolves with its external document ID and page. */
  onRequestSignature: () => Promise<ISignatureRequestResult>;
  /** Reads the signing flow and resolves true only after the document is completed. */
  onCheckSignatureCompletion: (externalDocumentId: string) => Promise<boolean>;
  onDismiss: () => void;
  /** Saves the decision. A rejection keeps this dialog open, with its comment intact, for retry. */
  onConfirm: (comment: string) => Promise<void> | void;
}

/**
 * Keeps a signature-required approval in one accountable interaction: the reviewer first raises
 * their signature request, sees its successful handoff, writes the decision comment, and
 * only then can submit the approval. Reject and return retain the standard comment-only flow.
 */
export const ApprovalDecisionModal: React.FC<IApprovalDecisionModalProps> = ({
  isOpen,
  task,
  outcome,
  title,
  confirmText,
  confirmTone = 'primary',
  onRequestSignature,
  onCheckSignatureCompletion,
  onDismiss,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const signatureRequired = outcome === 'Approved' && task.requireSignature;
  const [comment, setComment] = React.useState('');
  const [externalDocumentId, setExternalDocumentId] = React.useState<string | undefined>(undefined);
  // The signing page link is only known in this session; after a reload the request is checked by id.
  const [signingUrl, setSigningUrl] = React.useState<string | undefined>(undefined);
  const [frameOpen, setFrameOpen] = React.useState(false);
  const [signatureCompleted, setSignatureCompleted] = React.useState(false);
  const [signatureBusy, setSignatureBusy] = React.useState(false);
  const [signatureError, setSignatureError] = React.useState<string | undefined>(undefined);
  const [decisionBusy, setDecisionBusy] = React.useState(false);
  const [decisionError, setDecisionError] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!isOpen) return;
    setComment('');
    setExternalDocumentId(task.signatureExternalDocumentId);
    setSigningUrl(undefined);
    setFrameOpen(false);
    setSignatureCompleted(!!task.signatureCompletedAt);
    setSignatureBusy(false);
    setSignatureError(undefined);
    setDecisionBusy(false);
    setDecisionError(undefined);
  }, [isOpen, task.id, task.signatureExternalDocumentId, task.signatureCompletedAt]);

  const requestSignature = async (): Promise<void> => {
    setSignatureBusy(true);
    setSignatureError(undefined);
    try {
      const request = await onRequestSignature();
      setExternalDocumentId(request.externalDocumentId);
      setSigningUrl(request.signingUrl);
      setFrameOpen(true);
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : t('correspondenceDetail.eSignature.failed'));
    } finally {
      setSignatureBusy(false);
    }
  };

  const checkSignatureCompletion = async (): Promise<void> => {
    if (!externalDocumentId) return;
    setSignatureBusy(true);
    setSignatureError(undefined);
    try {
      const isCompleted = await onCheckSignatureCompletion(externalDocumentId);
      if (!isCompleted) {
        setSignatureError(t('correspondenceDetail.approvals.signaturePending'));
        return;
      }
      setSignatureCompleted(true);
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : t('correspondenceDetail.eSignature.failed'));
    } finally {
      setSignatureBusy(false);
    }
  };

  // Leaving the signing page checks the signature straight away, unless the signer declined.
  const handleFrameClose = (outcome: SigningFrameOutcome): void => {
    setFrameOpen(false);
    if (outcome === 'declined') {
      setSignatureError(t('correspondenceDetail.approvals.signatureDeclined'));
      return;
    }
    checkSignatureCompletion().catch(() => undefined);
  };

  const trimmedComment = comment.trim();
  // A link only proves that the signing page opened. The comment and action do not exist until the
  // status flow reads the external document back as completed and persists it on this task.
  const canEnterDecision = !signatureRequired || signatureCompleted;
  const canConfirm = canEnterDecision && !!trimmedComment && !signatureBusy && !decisionBusy;

  const submitDecision = async (): Promise<void> => {
    if (!canConfirm) return;
    setDecisionBusy(true);
    setDecisionError(undefined);
    try {
      await onConfirm(trimmedComment);
      // Approval Tasks closes this dialog after a successful save. Resetting this state also keeps
      // the shared dialog usable for any future caller that intentionally leaves it open.
      setDecisionBusy(false);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : t('approvalTasks.modal.decisionFailed'));
      setDecisionBusy(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onDismiss={onDismiss}
        title={title}
        width={460}
        isDismissable={!signatureBusy && !decisionBusy}
        footer={
          <>
            <Button
              variant="default"
              text={t('common.cancel')}
              onClick={onDismiss}
              disabled={signatureBusy || decisionBusy}
            />
            {canEnterDecision && (
              <Button
                variant={confirmTone === 'danger' ? 'danger' : 'primary'}
                disabled={!canConfirm}
                text={confirmText}
                onClick={submitDecision}
              />
            )}
          </>
        }
      >
        {signatureRequired && (
          <section className={styles.signatureStep} aria-live="polite">
            <div className={styles.signatureHeading}>
              <PenLine size={16} aria-hidden="true" />
              <span>{t('correspondenceDetail.approvals.signatureStepTitle')}</span>
            </div>
            {signatureBusy && !signatureCompleted ? (
              // One status line while the signing page is prepared or the signature verified — the
              // document upload and flow round trip take a few seconds, with nothing else to do.
              <div className={styles.checking} role="status">
                <Spinner
                  variant="inline"
                  label={t(
                    externalDocumentId
                      ? 'correspondenceDetail.approvals.signatureChecking'
                      : 'correspondenceDetail.approvals.signatureSending'
                  )}
                />
              </div>
            ) : !externalDocumentId ? (
              <>
                <p className={styles.help}>{t('correspondenceDetail.approvals.signatureStepHelp')}</p>
                <Button
                  variant="primary"
                  text={t('correspondenceDetail.approvals.signatureAction')}
                  onClick={requestSignature}
                />
              </>
            ) : !signatureCompleted ? (
              <>
                <p className={styles.help}>{t('correspondenceDetail.approvals.signatureCheckHelp')}</p>
                <div className={styles.signatureActions}>
                  {/* Signing is the next step when the page is still available in this session. */}
                  {signingUrl && (
                    <Button
                      variant="primary"
                      text={t('correspondenceDetail.approvals.signatureReopen')}
                      onClick={() => setFrameOpen(true)}
                    />
                  )}
                  <Button
                    variant={signingUrl ? 'default' : 'primary'}
                    text={t('correspondenceDetail.approvals.signatureCheckAction')}
                    onClick={checkSignatureCompletion}
                  />
                </div>
              </>
            ) : (
              <div className={styles.success} role="status">
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>{t('correspondenceDetail.approvals.signatureSuccess')}</span>
              </div>
            )}
            {signatureError && <p className={styles.error}>{signatureError}</p>}
          </section>
        )}

        {canEnterDecision && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`approval-comment-${task.id}`}>
              {t('actionComment.label')}
              <span className={styles.required}> *</span>
            </label>
            <textarea
              id={`approval-comment-${task.id}`}
              autoFocus
              rows={3}
              className={styles.textarea}
              value={comment}
              placeholder={t('actionComment.placeholder')}
              onChange={(event) => setComment(event.target.value)}
              disabled={decisionBusy}
            />
          </div>
        )}
        {decisionBusy && (
          <div className={styles.checking} role="status">
            <Spinner variant="inline" label={t('approvalTasks.modal.savingDecision')} />
          </div>
        )}
        {decisionError && (
          <p className={styles.error} role="alert">
            {decisionError}
          </p>
        )}
      </Modal>
      <SigningFrameModal
        url={isOpen && frameOpen ? signingUrl : undefined}
        returnUrl={pageSigningReturnUrl()}
        onClose={handleFrameClose}
      />
    </>
  );
};

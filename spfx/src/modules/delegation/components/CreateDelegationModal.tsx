import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, X } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Dropzone } from '../../../components/common/Dropzone';
import { IDirectoryPerson } from '../../../models/IDelegation';
import styles from './CreateDelegationModal.module.scss';

/** Shape passed to `onSave`, deliberately matching IDelegationService's ICreateDelegationInput
 * (delegator/delegate, not the old fromUserId/toUserId mock-only naming) so DelegationView can
 * forward it straight to `delegationService.create()` with no further mapping. Display names are
 * no longer resolved here — a successful create() is followed by a grid refresh() that re-queries
 * the real record (with names) from the service. */
export interface ICreateDelegationSaveInput {
  delegator: string;
  delegate: string;
  reason: string;
  startDate: string;
  endDate: string;
  isAdmin: boolean;
  attachments: { fileName: string; fileType: string; content: Blob }[];
}

export interface ICreateDelegationModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  /** Resolves once services.delegationService.create() settles. Rejections are caught here (not
   * by the caller) so a failed create — e.g. a rejected attachment fileType per AC5 — surfaces as
   * a clear inline error without losing the form's entered data. */
  onSave: (input: ICreateDelegationSaveInput) => Promise<void>;
  /** Admin gets an editable directory picker for "Delegate From"; a standard user gets a read-only field pre-filled with their own name. */
  isAdmin: boolean;
  /** Display only, for the read-only "Delegate From" field on the self-service path. */
  currentUserName: string;
  /** The signed-in user's own CORMS-site directory id (services.delegationService.getMyDirectoryId()),
   * used to exclude "myself" from the self-service "Delegate To" picker by id. Not IUser.id, which
   * is scoped to the RecordsHub site collection and would not match listDirectory()'s CORMS-site
   * ids — comparing those two id spaces (or worse, comparing display names, which can collide) is
   * exactly the fragile check this prop replaces. May be '' briefly while DelegationView's fetch is
   * still in flight, in which case the self-service picker simply doesn't exclude anyone yet (the
   * server-side create() gate below is the real backstop regardless). */
  currentUserId: string;
  /** Sourced from services.delegationService.listDirectory() by DelegationView — this modal never
   * reads the directory fixture directly. */
  directory: IDirectoryPerson[];
}

/** e.g. "report.pdf" -> "PDF", "sheet.xlsx" -> "XLSX". Passed through uppercased even when the
 * extension doesn't map to one of DelegationServiceCore's five valid FileType values — server-side
 * validation is the real gate (AC5), not a client-side pre-filter. */
function extensionToFileType(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  const ext = dotIndex !== -1 ? fileName.slice(dotIndex + 1) : fileName;
  return ext.toUpperCase();
}

export const CreateDelegationModal: React.FC<ICreateDelegationModalProps> = ({
  isOpen,
  onDismiss,
  onSave,
  isAdmin,
  currentUserName,
  currentUserId,
  directory,
}) => {
  const { t } = useTranslation();
  const [fromUserId, setFromUserId] = React.useState('');
  const [toUserId, setToUserId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [documents, setDocuments] = React.useState<File[]>([]);
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);

  const reset = (): void => {
    setFromUserId('');
    setToUserId('');
    setReason('');
    setStartDate('');
    setEndDate('');
    setDocuments([]);
    setTouched(false);
    setSaveError(undefined);
  };

  const handleDismiss = (): void => {
    reset();
    onDismiss();
  };

  const fromValid = isAdmin ? !!fromUserId : true;
  const toValid = !!toUserId;
  const reasonValid = reason.trim().length > 0;
  const startValid = !!startDate;
  // ISO yyyy-mm-dd strings (native <input type="date">'s value format) compare correctly
  // as plain strings, so this also catches an end date before the start date.
  const endValid = !!endDate && endDate >= startDate;
  const isValid = fromValid && toValid && reasonValid && startValid && endValid;

  const handleSave = (): void => {
    setTouched(true);
    if (!isValid) return;

    setSaveError(undefined);
    setSaving(true);
    // File already is a Blob (a real DOM File) — pass it through as-is rather than reading it into
    // an ArrayBuffer first, which would be a redundant full-file copy for no benefit.
    onSave({
      // Empty on the self-service path: DelegationServiceCore.create() ignores `delegator` entirely
      // unless the caller is a confirmed SystemAdministrator, and re-derives it from the signed-in
      // user otherwise (AC1). Sending an id here would be decorative at best.
      delegator: isAdmin ? fromUserId : '',
      delegate: toUserId,
      reason,
      startDate,
      endDate,
      isAdmin,
      attachments: documents.map((file) => ({ fileName: file.name, fileType: extensionToFileType(file.name), content: file })),
    })
      .then(() => {
        setSaving(false);
        reset();
      })
      .catch((err: unknown) => {
        setSaving(false);
        setSaveError(err instanceof Error ? err.message : String(err));
      });
  };

  // Never offer the delegator as their own delegate — by id in both cases now. On the admin path
  // that's the picked "Delegate From" id; on the self-service path it's currentUserId (see that
  // prop's comment for why display-name comparison isn't a reliable substitute). Server-side
  // create() re-validates this regardless (see DelegationServiceCore.create) — this filter is only
  // the picker's own affordance, not the real gate.
  const toOptions = isAdmin ? directory.filter((p) => p.id !== fromUserId) : directory.filter((p) => p.id !== currentUserId);

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={handleDismiss}
      title={t('delegation.modal.title')}
      footer={
        <>
          <Button variant="default" text={t('delegation.modal.cancel')} onClick={handleDismiss} disabled={saving} />
          <Button variant="primary" text={t('delegation.modal.save')} onClick={handleSave} disabled={saving} />
        </>
      }
    >
      {saveError && <div className={styles.saveError}>{saveError}</div>}

      <div className={styles.field}>
        <span className={styles.label}>{t('delegation.modal.delegateFrom')}</span>
        {isAdmin ? (
          <select
            className={`${styles.select} ${touched && !fromValid ? styles.invalid : ''}`}
            value={fromUserId}
            onChange={(e) => setFromUserId(e.target.value)}
          >
            <option value="">{t('delegation.modal.selectPlaceholder')}</option>
            {directory.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        ) : (
          <input className={styles.input} value={currentUserName} disabled readOnly />
        )}
        {touched && !fromValid && <span className={styles.error}>{t('common.requiredField')}</span>}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('delegation.modal.delegateTo')} *</span>
        <select
          className={`${styles.select} ${touched && !toValid ? styles.invalid : ''}`}
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
        >
          <option value="">{t('delegation.modal.selectDelegatePlaceholder')}</option>
          {toOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
        {touched && !toValid && <span className={styles.error}>{t('common.requiredField')}</span>}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('delegation.modal.reason')} *</span>
        <textarea
          className={`${styles.textarea} ${touched && !reasonValid ? styles.invalid : ''}`}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {touched && !reasonValid && <span className={styles.error}>{t('common.requiredField')}</span>}
      </div>

      <div className={styles.dateRow}>
        <div className={styles.field}>
          <span className={styles.label}>{t('delegation.modal.startDate')} *</span>
          <input
            type="date"
            className={`${styles.input} ${touched && !startValid ? styles.invalid : ''}`}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {touched && !startValid && <span className={styles.error}>{t('common.requiredField')}</span>}
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('delegation.modal.endDate')} *</span>
          <input
            type="date"
            min={startDate || undefined}
            className={`${styles.input} ${touched && !endValid ? styles.invalid : ''}`}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          {touched && !endValid && (
            <span className={styles.error}>
              {endDate ? t('delegation.modal.endBeforeStart') : t('common.requiredField')}
            </span>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('delegation.modal.supportingDocuments')}</span>
        <Dropzone
          title={t('delegation.modal.attachDocument')}
          helperText={t('delegation.modal.attachHelper')}
          accept=".pdf,.docx,.xlsx,.png"
          onFilesSelected={(files) => setDocuments((prev) => [...prev, ...files])}
        />
        {documents.length > 0 && (
          <div className={styles.docList}>
            {documents.map((file, i) => (
              <div key={`${file.name}-${i}`} className={styles.docRow}>
                <span className={styles.docName}>{file.name}</span>
                <button
                  type="button"
                  className={styles.docRemove}
                  onClick={() => setDocuments((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={file.name}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.infoNote}>
        <ShieldAlert size={16} />
        <span>{t('delegation.modal.infoNote')}</span>
      </div>
    </Modal>
  );
};
